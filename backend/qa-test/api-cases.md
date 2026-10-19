# QA 接口测试用例清单（可执行）

> 目标：`POST /api/message`、`GET /api/message/list`
> 运行前提：后端已在 `http://localhost:8000` 启动，MySQL 已建表。
> 使用方式：`bash backend/qa-test/api-cases.sh`

B=http://localhost:8000

| 编号 | 场景 | 请求 | 预期 code | 预期入库 | 实测结果 | 路由判定 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | 正常提交（手机号，无公司） | name=张先生, phone=13800000000, email='', content=12字 | 0 | 1 行，company=NULL | ✅ code=0，入库 | None |
| T2 | 正常提交（仅邮箱，有公司） | name=李女士, email=li@example.com, company=示例集团 | 0 | 1 行 | ✅ code=0，入库 | None |
| T3 | 姓名必填缺失（name=''） | name='', phone=13800000000 | 1001 | 0 行 | ✅ 1001「此项为必填」 | None |
| T4 | 姓名长度不足（1 字） | name=张 | 1001 | 0 行 | ✅ 1001「姓名需为 2~30 个字符」 | None |
| T5 | **电话与邮箱都为空** | name=王先生, phone='', email='' | **1001** | **0 行** | ❌ **实测 code=0 且错误入库（1 行）** | **Engineer** |
| T6 | 非法手机号（12345） | phone=12345 | 1001 | 0 行 | ✅ 1001「请填写正确的电话号码」 | None |
| T7 | 合法座机（带连字符） | phone=010-12345678 | 0 | 1 行 | ✅ code=0，入库 | None |
| T8 | 内容过短（<5） | content=hi | 1001 | 0 行 | ✅ 1001「留言内容需为 5~500 个字符」 | None |
| T9 | 非法邮箱 | email=not-an-email | 1001 | 0 行 | ✅ 1001「请填写正确的邮箱」 | None |
| T10 | 幂等重复提交（同 IP+同内容，60s 内 ×3） | 同上 content 连发 3 次 | 0/0/0 | **仅 1 行** | ✅ 3 次均 code=0，仅入库 1 行 | None |
| T11 | 非法手机号变体 | 12345678901 / 12800000000 / 1380000000 / 138000000001 | 1001 | 0 行 | ✅ 全部 1001 | None |
| T12 | 公司名超长（51 字） | company=公×51 | **1001** | 0 行 | ❌ **实测 code=0（被截断为 50 字后入库）** | **Engineer** |
| T13 | 内容超长（501 字） | content=测×501 | **1001** | 0 行 | ❌ **实测 code=0（被截断为 500 字后入库）** | **Engineer** |
| T14 | 留言列表 | GET /api/message/list?page=1&size=3 | 0 | — | ✅ 返回 total/page/size/items | None |
| T15 | 未知路由 | GET /api/nonexistent | 4004 | — | ✅ 4004「请求的资源不存在」 | None |
| T16 | CORS 预检 OPTIONS | OPTIONS /api/message, Origin=localhost:5173 | 204 | — | ✅ 204 + CORS 头 | None |
| T17 | 完全省略 company 字段 | 无 company 键 | 0 | 1 行，company=NULL | ✅ code=0 | None |
| T18 | 姓名超长（31 字） | name=张×31 | **1001** | 0 行 | ❌ **实测 code=0（截断为 30 字后入库）** | **Engineer** |
| T19 | 空 JSON body `{}` | {} | 1001 | 0 行 | ✅ 1001 | None |
| T20 | 表单格式提交（form-urlencoded） | Content-Type=form | 0 | 1 行 | ✅ code=0（Controller 兼容 post/param） | None |
| T21 | 内容缺失但电话合法 | 无 content 键 | 1001 | 0 行 | ✅ 1001「此项为必填」 | None |

## 关键 Bug 复现（T5）

```bash
# 电话与邮箱同时为空 —— 预期 1001，实测 code=0 且错误入库
curl -s -X POST http://localhost:8000/api/message \
  -H "Content-Type: application/json" \
  -d '{"name":"王先生","phone":"","email":"","content":"测试内容测试内容"}'
# 实测输出： {"code":0,"message":"ok","data":null}    <-- 错误，应为 code=1001
```

**根因**：TP8 `think-validate` 的 `Validate::checkItem()`（vendor/topthink/think-validate/src/Validate.php:955）在字段值为空字符串时**跳过所有自定义规则**，除非该字段在 `$must` 白名单中：

```php
if ('must' == $type || str_starts_with($type, 'require') || in_array($field, $this->must)
    || (!is_null($value) && '' !== $value)) {
    $result = call_user_func_array($callback, [$value, $rule, $data, $field, $title]);
} else {
    $result = true;   // 空值直接判定通过
}
```

`MessageValidate` 中 `phone`/`email` 规则为 `checkPhone`/`checkEmail`（自定义方法，非 `require`/`must`），且未在 `$must` 中声明，因此二者同时为空时两条规则都被跳过 → 校验通过。

**修复建议**（Engineer）：在 `MessageValidate` 中把 `phone`、`email` 加入 `$must`（或用 `requireWithout`/`requireIf` 组合，或在 `submit()` 前先做跨字段非空判断）。例如：

```php
protected $must = ['phone', 'email'];
```
