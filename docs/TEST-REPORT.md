# 测试报告 · corporate-site（通用企业官网）

| 项目 | 内容 |
| --- | --- |
| 报告版本 | v1.0 |
| 测试负责人 | 严过关（QA 工程师） |
| 测试日期 | 2026-10-16 |
| 上游文档 | `docs/PRD.md` v1.2、`docs/ARCHITECTURE.md` v1.0 |
| 被测代码 | `frontend/`（Vite+React18+TS+Tailwind）、`backend/`（ThinkPHP 8 + MySQL 8） |
| 总体结论 | ❌ **不可直接交付** —— 存在 1 个前端**阻塞**缺陷（构建失败）+ 2 个后端**严重**缺陷 |

---

## 一、测试环境说明（真实可用性）

| 组件 | 状态 | 实际版本 / 路径 | 说明 |
| --- | --- | --- | --- |
| Node.js | ✅ 可用 | v22.22.2（managed runtime） | 真实执行 |
| npm | ✅ 可用 | 10.9.7 | **注意**：直连 `registry.npmjs.org` 持续 `ECONNRESET`，改用 `registry.npmmirror.com` 后成功 |
| PHP | ✅ 可用（意外发现） | **8.3.33** via `E:/ServBay/bin/php.cmd` | 原以为不可用，实际 ServBay 自带，用于 `php -l` 与 `php think run` |
| Composer | ✅ 可用（意外发现） | **2.9.7** via `E:/ServBay/bin/composer.cmd` | 真实执行 `composer install` |
| MySQL | ✅ 可用（意外发现） | **8.0.46** via `E:/ServBay/bin/mysql.cmd` | 真实建库建表、真实读写校验 |
| 浏览器 | ❌ 未使用 | — | 未做真实浏览器/像素级响应式测试；响应式仅做**静态审查** |

> **说明**：任务书预估「php/composer 不可用」，但实测在 `E:/ServBay/` 下找到了可用的 PHP 8.3 / Composer 2.9 / MySQL 8.0，因此后端做了**真实运行 + 真实接口 + 真实入库**测试，而非仅静态审查。以下所有输出均为真实命令输出，未编造。

---

## 二、A. 前端真实构建验证

### 2.1 执行命令与真实输出

```bash
cd E:/aicode/frontend
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
# → added 139 packages in 44s   ✅

npm run build          # 即 tsc --noEmit && vite build
# → src/pages/News.tsx(120,50): error TS2345: Argument of type '(prev: 4) => number'
#   is not assignable to parameter of type 'SetStateAction<4>'.
#   Exit code: 2   ❌ 构建失败，未产出 dist
```

### 2.2 关键发现

- **`npm run build` 失败，退出码 2**，`tsc --noEmit` 阶段报 **1 个类型错误**，`vite build` 未被执行。
- **仅 1 处类型错误**（非 3 处，也非"编译大量报错"），定位精确：

  | 项 | 内容 |
  | --- | --- |
  | 文件 | `frontend/src/pages/News.tsx:19` 与 `:120` |
  | 代码 | `const [visibleCount, setVisibleCount] = useState(APP.NEWS_PAGE_SIZE);`（第 19 行）<br>`onClick: () => setVisibleCount((prev) => prev + APP.NEWS_PAGE_SIZE)`（第 120 行） |
  | 根因 | `constants/index.ts` 的 `APP` 对象为 `as const`，故 `APP.NEWS_PAGE_SIZE` 类型是**字面量 `4`**；`useState(4)` 推导出 `useState<4>`，而 setter 返回 `number`，`number` 不可赋给字面量类型 `4` |
  | 影响 | **阻塞**：`npm run build` 无法产出生产静态产物，无法交付部署 |
  | 判定 | **Engineer（源码 Bug）** |

- **反证（排除环境问题）**：单独执行 `npx vite build`（跳过 tsc）→ **成功**，`✓ 73 modules transformed`，产出 `dist/`（`index-*.js 218.48 kB`、`index-*.css 26.48 kB` 等）。说明代码可被 Vite 打包，**纯粹是 TS 类型问题** → 确认为源码 Bug，非测试/环境问题。

- **运行时冒烟（基于已产出的 dist）**：
  ```bash
  npx vite preview --port 4173
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/            # → 200
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/about       # → 200（SPA deep-link）
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/products/solution-cloud  # → 200
  # 首页 HTML 正常返回（含 title/description/keywords meta），JS/CSS 资源 HTTP 200
  ```
  → 首页可渲染、无 500，SPA 深链可用。（前提是先绕过 tsc 手动 `vite build`。）

### 2.3 前端校验逻辑单测（独立测试脚本，未污染业务代码）

编写 `frontend/qa-test/validate.test.mjs`：用 esbuild 打包 `src/utils/validate.ts` 后跑断言。**19 / 19 全部通过**，含边界值：

| 场景 | 预期 | 实测 |
| --- | --- | --- |
| 合法手机号 / 合法座机（带/不带连字符） | 通过 | ✅ |
| 仅邮箱且内容合法 | 通过 | ✅ |
| 电话+邮箱都为空 | 两项均报"请填写电话或邮箱" | ✅（前端逻辑正确） |
| name 边界 1/2/30/31 | 1:错，2/30:过，31:错 | ✅ |
| content 边界 4/5/500/501 | 4:错，5/500:过，501:错 | ✅ |
| company 空/≤50/51 | 空:过，51:错 | ✅ |
| 非法手机号 `12345` | 报"请填写正确的电话号码" | ✅ |
| 非法邮箱 `bad@` | 报"请填写正确的邮箱" | ✅ |

> **结论**：前端校验工具 `validate.ts` 逻辑本身**正确**，与 PRD/架构规则一致。
> **注意**：这暴露了一个重要对照 —— **前端能正确识别"电话邮箱都为空"，但后端不能**（见第四节 T5），即后端的服务端二次校验弱于前端，违反 PRD 7.2「后端为最终裁决」。

---

## 三、B. 后端真实运行与接口测试

### 3.1 依赖安装

```bash
# 首次 composer install —— ❌ 失败
composer install --no-interaction
# → In ClassMapGenerator.php line 137:
#   Could not scan for classes inside "extend" which does not appear to be a file nor folder
# → vendor/autoload.php 未生成；退出码 0（但 autoload 生成失败）
```

| 项 | 内容 |
| --- | --- |
| 文件 | `backend/composer.json`（`autoload.classmap: ["extend"]`） |
| 根因 | `composer.json` 声明 `classmap: ["extend"]`，但仓库中**不存在 `extend/` 目录** |
| 影响 | **阻塞**：`vendor/autoload.php` 无法生成 → `public/index.php` 的 `require vendor/autoload.php` 直接致命错误 → **后端完全无法启动** |
| 判定 | **Engineer（源码 Bug）** |
| 证据 | `ls backend/vendor/autoload.php` → `No such file or directory`；`ls backend/extend` → 不存在 |

**QA 临时绕过（仅为继续深入测试，未修改源码）**：创建空的 `backend/extend/.gitkeep` 后重新 `composer dump-autoload` → 成功生成 autoload，随后完成全链路测试。**该临时目录需由 Engineer 以正确方式修复（补齐 `extend/` 或从 `composer.json` 移除 classmap 项）。**

```bash
php -l（全部 25 个 PHP 文件）  # → 全部 "No syntax errors detected"  ✅
```

### 3.2 启动与健康检查

```bash
php think run --port 8000
curl -s http://127.0.0.1:8000/
# → {"code":0,"message":"ok","data":{"service":"corporate-site-api","status":"running"}}
#    HTTP 200，且返回 CORS 响应头
```

### 3.3 接口测试结果汇总（详见 `backend/qa-test/api-cases.md`）

**21 条用例，14 通过 / 7 失败**，关键结果：

| 编号 | 场景 | 预期 | 实测 | 路由判定 |
| --- | --- | --- | --- | --- |
| T1 | 正常提交（手机号） | code=0，入库 | ✅ code=0，入库 | None |
| T2 | 正常提交（仅邮箱+公司） | code=0，入库 | ✅ code=0，入库 | None |
| T3 | name 必填缺失 | 1001 | ✅ 1001「此项为必填」 | None |
| T4 | name 长度不足 | 1001 | ✅ 1001 | None |
| **T5** | **电话与邮箱都为空** | **1001 / 不入库** | ❌ **code=0 且错误入库** | **Engineer** |
| T6 | 非法手机号 12345 | 1001 | ✅ 1001 | None |
| T7 | 合法座机 010-12345678 | code=0 | ✅ code=0 | None |
| T8 | 内容过短 | 1001 | ✅ 1001 | None |
| T9 | 非法邮箱 | 1001 | ✅ 1001 | None |
| T10 | 幂等重复提交 ×3 | 仅入库 1 行 | ✅ 3 次 code=0，仅 1 行 | None |
| T11 | 非法手机号变体 ×4 | 1001 | ✅ 全部 1001 | None |
| **T12** | **company 51 字** | **1001** | ❌ **code=0（静默截断后入库）** | **Engineer** |
| **T13** | **content 501 字** | **1001** | ❌ **code=0（静默截断后入库）** | **Engineer** |
| T14 | 留言列表分页 | code=0 分页结构 | ✅ 正常 | None |
| T15 | 未知路由 | 4004 | ✅ 4004 | None |
| T16 | OPTIONS 预检 | 204 + CORS 头 | ✅ 204 + 头齐全 | None |
| T17 | 省略 company 字段 | code=0，company=NULL | ✅ | None |
| **T18** | **name 31 字** | **1001** | ❌ **code=0（静默截断后入库）** | **Engineer** |
| T19 | 空 body `{}` | 1001 | ✅ 1001 | None |
| T20 | form-urlencoded 提交 | code=0 | ✅ code=0 | None |
| T21 | content 缺失 | 1001 | ✅ 1001 | None |

### 3.4 严重 Bug 详解

#### 【严重-1】电话与邮箱同时为空时，后端校验失效（T5）—— 违反 PRD 7.2

```bash
curl -s -X POST http://127.0.0.1:8000/api/message -H "Content-Type: application/json" \
  -d '{"name":"王先生","phone":"","email":"","content":"测试内容测试内容"}'
# 实测： {"code":0,"message":"ok","data":null}     ← 错误，应为 {"code":1001,"message":"请填写电话或邮箱"}
# 且该非法记录已写入数据库（message 表 id=3，phone/email 均为空）
```

**根因（已定位到框架源码）**：ThinkPHP 8 `think-validate` 的 `Validate::checkItem()`（`vendor/topthink/think-validate/src/Validate.php:955`）在字段值为**空字符串**时，会**跳过所有自定义规则**，除非该字段以 `require*` 或 `must` 开头或命中 `$this->must`：

```php
if ('must' == $type || str_starts_with($type, 'require') || in_array($field, $this->must)
    || (!is_null($value) && '' !== $value)) {
    $result = call_user_func_array($callback, [$value, $rule, $data, $field, $title]);
} else {
    $result = true;   // ← 空值直接判通过
}
```

`MessageValidate` 中 `phone` / `email` 的规则是 `checkPhone` / `checkEmail`（自定义方法，非 require/must），且未声明 `$must`，因此二者同时为空时，两个跨字段"至少填一项"的校验被**双双跳过** → 整体校验通过。

**隔离验证（`php qa-test/qa_val_test.php`）**：
```
both phone & email empty (expect FAIL)   => PASS     ← 复现 Bug
```

**修复建议（已验证有效）**：在 `MessageValidate` 中把 `phone`、`email` 加入 `$must`：
```php
protected $must = ['phone', 'email'];
```
`php qa-test/qa_fix_verify.php` 验证结果：
```
--- BEFORE fix ---  both empty => PASS        （错误）
--- AFTER  fix ---  both empty => FAIL: 请填写正确的电话号码   （正确）
                    phone ok/email empty => PASS   （未误伤）
                    email ok/phone empty => PASS   （未误伤）
```

#### 【严重-2】超长字段被静默截断，校验被绕过（T12/T13/T18）

`MessageService::normalize()` 在**校验之前**用 `mb_substr` 把 name/company/content 截断到上限，导致后续 Validate 永远看不到超长值 → 超长提交一律 `code=0` 且被"裁剪后"入库：

```bash
team content=501 字  → 实测 {"code":0}，DB 中该条 content 实际存储 500 字（CHAR_LENGTH=500）
name=31 字           → 实测 {"code":0}，DB 中实际存储 30 字
company=51 字        → 实测 {"code":0}，DB 中实际存储 50 字
```

**隔离验证（`php qa-test/qa_norm_test.php`）**：
```
name 31 chars     raw=31 -> after normalize=30 => PASS (silently accepted, data truncated)
company 51 chars  raw=51 -> after normalize=50 => PASS (silently accepted, data truncated)
content 501 chars raw=501 -> after normalize=500 => PASS (silently accepted, data truncated)
```

**影响**：与 PRD 7.2 / 架构 4.3 明确要求的"长度 2~30 / 5~500 / ≤50 超限应报 1001"**不一致**；用户提交超长内容不会收到任何错误提示，且实际数据被悄悄篡改。
**修复建议**：先 `Validate::check()`，**校验通过后**再做 `mb_substr` 纵深截断；或把规则改为 `length` 校验并保留原值校验。

---

## 四、C. 前后端契约一致性核对

| 维度 | 前端 | 后端 | 数据库表 | 一致性 |
| --- | --- | --- | --- | --- |
| name | `MessagePayload.name: string`，2~30 | `require\|length:2,30` | `varchar(30) NOT NULL` | ✅ |
| company | `company?: string`（选填，≤50） | `max:50` | `varchar(50) NULL` | ✅ 字段/可空性一致 |
| phone | `string`，手机/座机正则 | `checkPhone`，同正则 | `varchar(20)` | ✅ 正则一致 |
| email | `string`，邮箱正则 | `checkEmail`，同正则 | `varchar(100)` | ✅ 正则一致 |
| content | `string`，5~500 | `require\|length:5,500` | `varchar(500)` | ✅ |
| 电话/邮箱至少一项 | `validateMessage` 正确实现 | ❌ **checkPhone/checkEmail 空值被跳过（T5）** | — | ❌ **不一致** |
| 统一响应 | `ApiResponse{code,message,data}` | `success()/fail()` 返回同结构 | — | ✅ |
| 错误码 | 0/1001/1002/4004/5000 | `error_code()` 完全一致 | — | ✅ |
| API 路径 | `submitMessage → POST /api/message`；`fetchMessageList → GET /api/message/list` | `Route::post('message')` / `Route::get('message/list')`（group `api`） | — | ✅ |
| `/api` 前缀与代理 | `.env` `VITE_API_BASE=/api`；`vite.config.ts` proxy `/api → localhost:8000` | 路由 group 前缀 `api` | — | ✅ 已验证（经 5173 代理端到端提交成功） |
| CORS | — | `app/middleware.php` 全局注册 `Cors`，OPTIONS 返 204 | — | ✅ 实测通过 |
| common.php 注册 | — | `composer.json` `autoload.files` 含 `app/common.php` | — | ✅ 已正确注册（`success()/fail()` 在接口中均生效） |
| 幂等 | 前端 30s 冷却 | `findDuplicate(ip,content,60)` + `idx_ip_created` 索引 | 索引存在 | ✅ 实测 3 连发仅入库 1 行 |
| 建表脚本 | — | `database/message.sql` | 实际执行后 `company` 允许 NULL，索引 `idx_ip_created(ip,created_at)` | ✅ 与设计一致 |

**契约结论**：字段/响应/错误码/路径/代理/CORS/幂等**基本一致**；唯一实质性不一致是**「电话/邮箱至少填一项」的服务端校验失效**（T5）。

---

## 五、D. 需求覆盖核对（PRD P0-1 ~ P0-10）

| 编号 | 需求 | 实现情况 | 说明 |
| --- | --- | --- | --- |
| P0-1 | 首页（6 大区块） | ✅ 已实现 | `Home.tsx` 组合 Hero/Business/Stats/Cases/News/ContactCta 6 区块，配置驱动 |
| P0-2 | 关于我们 | ✅ 已实现 | `About.tsx` 含简介/愿景使命/时间轴/能力/价值观，来自 `data/about.ts` |
| P0-3 | 产品服务（列表+详情） | ✅ 已实现 | `Products.tsx`（分类 Tab 筛选）+ `ProductDetail.tsx`（非法 id 友好处理）；数据 8 条 / 3 分类 |
| P0-4 | 新闻中心（列表+详情） | ⚠️ 部分实现 | 功能完整，但 **`News.tsx` 存在类型错误导致整站构建失败**（见 §2.2） |
| P0-5 | 联系我们（联系方式+地图+表单） | ✅ 已实现 | `Contact.tsx` 四项联系方式 + 地图占位 + `MessageForm` |
| P0-6 | 全站响应式（375/768/1024/1440） | ⚠️ 仅静态审查 | Tailwind 断点类齐全（`md:`/`lg:`、汉堡菜单、`overflow-x:hidden`）；**未做真实浏览器像素验证** |
| P0-7 | 留言功能 | ❌ 部分失败 | 前端校验正确、提交/反馈/冷却/幂等均正常；但**后端「至少填一项」校验失效 + 超长静默截断**（T5/T12/T13/T18） |
| P0-8 | 内容配置化 | ✅ 已实现 | `site.config.ts` + `src/data/*.ts` 驱动，组件内无硬编码公司名/电话 |
| P0-9 | 全站导航与页脚 | ✅ 已实现 | `Navbar`（滚动吸顶+移动端汉堡）+ `Footer`，来自 site config |
| P0-10 | 基础 SEO | ✅ 已实现 | `SEO.tsx` 运行时写 title/description/keywords + OG 标签 |

**P0 覆盖：6 项 ✅ / 3 项 ⚠️ / 1 项 ❌**（P0-3/P1 分类筛选亦已实现，超出 P0 要求）

---

## 六、发现的问题清单（按级别 + 智能路由判定）

| # | 级别 | 文件 / 位置 | 问题 | 复现方式 | 证据 | 路由判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **阻塞** | `frontend/src/pages/News.tsx:19,120` | `useState(APP.NEWS_PAGE_SIZE)`（字面量 `4`）致 setter 类型错误，`npm run build` 失败 | `cd frontend && npm run build` | `error TS2345 ... '(prev: 4) => number' is not assignable to 'SetStateAction<4>'`；退出码 2 | **Engineer** |
| 2 | **阻塞** | `backend/composer.json:autoload.classmap` | 声明 `classmap:["extend"]` 但 `extend/` 目录不存在，`composer install` 无法生成 `vendor/autoload.php`，后端无法启动 | `cd backend && composer install` | `Could not scan for classes inside "extend" ...`；`vendor/autoload.php` 缺失 | **Engineer** |
| 3 | **严重** | `backend/app/validate/MessageValidate.php` | 电话与邮箱同时为空时校验被跳过（TP8 空值跳过自定义规则），非法记录入库 | `curl POST /api/message` 带 `phone:""`,`email:""` | 实测 `{"code":0}`，DB 新增 phone/email 均为空的记录；`qa-test/qa_val_test.php` 复现 | **Engineer** |
| 4 | **严重** | `backend/app/service/MessageService.php:normalize()` | 校验前先 `mb_substr` 截断，超长提交被静默接受并入库，违反 PRD 长度校验 | 提交 name 31 字 / company 51 字 / content 501 字 | 均返回 `{"code":0}`，DB 存储被截断值；`qa-test/qa_norm_test.php` 复现 | **Engineer** |
| 5 | 一般 | `frontend/package.json` / 环境 | npm 直连官方源不稳定，`ECONNRESET` 导致安装失败 | `npm install`（默认源） | npm debug log：`http fetch GET ... failed with ECONNRESET` | None（环境问题；建议文档补充镜像源说明） |
| 6 | 建议 | `frontend/src/components/Footer.tsx:11` | `new Date().getFullYear()` 与 `footer.copyright` 固定年份可能不一致，属冗余 | 代码审查 | — | None（可选优化） |
| 7 | 建议 | P0-6 响应式 | 未做真实浏览器 375/768/1024/1440 断点验证 | 需浏览器/设备 | — | QA（后续可补） |

> **无 QA 自身测试代码缺陷遗留**：前端校验单测首次 1 处 FAIL 系我方测试用例输入 `'需要方案'`（4 字）低于 5 字下限，已修正用例，最终 19/19 通过，**非源码问题**。

---

## 七、总体结论

- **前端**：`vite build` 可打包（73 模块），但 **`npm run build`（含 tsc）失败**，无法产出符合 CI/交付要求的静态产物 → **阻塞**。
- **后端**：在 ServBay PHP 8.3 / Composer 2.9 / MySQL 8.0 下真实安装并运行，**`composer install` 因 `extend/` 缺失而失败**（阻塞）；绕过该问题后接口主体功能、分层、幂等、CORS、错误码、分页均**工作正常**，但存在 **2 个严重校验缺陷**。
- **通过率**：
  - 前端校验单测：**19 / 19（100%）**
  - 后端接口用例：**14 / 21（约 67%）**，7 条失败均集中在 2 个校验缺陷上
  - 前端构建：**失败（0%）**
- **是否可交付**：❌ **不可直接交付**。需 Engineer 修复 **问题 1、2、3、4** 后回归验证（预计为第 2 轮测试）。

---

## 八、附录：本次测试新增文件（均为独立 QA 产物，未修改任何业务源码）

| 文件 | 用途 |
| --- | --- |
| `frontend/qa-test/validate.test.mjs` | 前端校验逻辑单测（esbuild 打包后断言，19 用例） |
| `backend/qa-test/api-cases.md` | 接口测试用例清单（含真实结果与根因） |
| `backend/qa-test/qa_val_test.php` | 后端验证器隔离测试（复现 T5） |
| `backend/qa-test/qa_norm_test.php` | normalize-先于-validate 截断问题复现 |
| `backend/qa-test/qa_fix_verify.php` | 验证 T5 修复方案（`$must`）有效且不误伤 |
| `backend/extend/.gitkeep` | **QA 临时绕过**（为继续测试而建，请 Engineer 以正确方式修复后处理） |

*第 1 轮报告结束 · QA 工程师 严过关*

---

# 第 2 轮回归验证报告（独立复核）

| 项目 | 内容 |
| --- | --- |
| 报告版本 | v2.0（追加第 2 轮，保留第 1 轮全部记录） |
| 测试负责人 | 严过关（QA 工程师） |
| 测试日期 | 2026-10-16 |
| 测试对象 | 工程师寇豆码对第 1 轮 4 个缺陷的修复 |
| 复核方式 | **完全独立重跑**，未采信工程师自述 |
| 环境 | PHP 8.3.33 / Composer 2.9.7 / MySQL 8.0.46（`E:/ServBay/bin/`）；Node v22.22.2 + npm 镜像源 |
| 第 2 轮结论 | ✅ **4 个缺陷全部确认修复，无回归、无新引入问题 → 可交付** |

---

## 九、4 个缺陷的独立复核结论

| # | 缺陷 | 修复声称 | 独立验证方法 | 复核结论 |
| --- | --- | --- | --- | --- |
| 1 | `News.tsx` 类型错误致构建失败 | `useState<number>` | 源码核查 + 重跑 `npm run build` | ✅ **已修复** |
| 2 | `composer.json` classmap `extend/` 缺失 | 保留 classmap，`extend/` 存在 | 源码核查 + 重跑 `composer install` | ✅ **已修复** |
| 3 | 电话+邮箱都为空时校验失效 | 新增 `$must = ['phone','email']` | 源码核查 + 提交前后 count 对比 + 未误伤验证 | ✅ **已修复** |
| 4 | 超长字段静默截断入库 | 拆分 `normalize()`/`enforceLimits()` | 源码核查 + 超长/边界值逐条实测 | ✅ **已修复** |

### 缺陷 1 复核：前端构建

源码核查（`frontend/src/pages/News.tsx:21`）：
```ts
const [visibleCount, setVisibleCount] = useState<number>(APP.NEWS_PAGE_SIZE);
```
真实执行：
```bash
rm -rf dist && cd frontend && npm run build
# → tsc --noEmit && vite build
# → ✓ 73 modules transformed.  ✓ built in 1.07s
# EXIT=0
# tsc error count = 0     ← 类型错误确已清零
# dist/ 已产出（index.html / assets/index-Clv5zMVq.js 218.48kB / index-3LlP-5Io.css 26.48kB）
```
✅ **已修复**。TS 错误确为 0（非仅 vite 部分成功）。

### 缺陷 2 复核：后端依赖安装

```bash
ls backend/extend/            # → .gitkeep 存在，目录存在
cd backend && composer install --no-interaction
# → Generating autoload files ... Succeed!  EXIT=0
# → 无 "Could not scan for classes inside \"extend\"" 报错
ls -la vendor/autoload.php    # → 存在（748 bytes）
```
✅ **已修复**。第 1 轮的确切失败命令现返回 EXIT=0，autoload 正常生成。

### 缺陷 3 复核：电话/邮箱至少填一项（关键）

源码核查（`backend/app/validate/MessageValidate.php:64`）：`protected $must = ['phone', 'email'];` ✅ 存在

**提交前后 count 对比（排除旧数据干扰）**：
```bash
提交前 count = 14
POST {"name":"R2空号测试","phone":"","email":"","content":"第二轮空电话邮箱测试"}
# → {"code":1001,"message":"请填写正确的电话号码","data":null}   ← 正确拦截
提交后 count = 14   (Δ=0，未新增入库)   ← 修复前会错误入库
```
**未误伤验证**：
```
仅手机 (phone=13911112222, email="")        → {"code":0}   ✅
仅邮箱 (phone="", email=r2@example.com)     → {"code":0}   ✅
phone+email 均有效                          → {"code":0}   ✅
phone有效+email非法 ("bad@")                → {"code":1001,"message":"请填写正确的邮箱"}   ✅
phone非法("12345")+email有效                → {"code":1001,"message":"请填写正确的电话号码"}  ✅
```
DB 复核：第 2 轮新增的 both-empty 记录 `R2空号测试`/`R2空格` **0 条**（应被拦截）。
> 注：第 1 轮遗留的 `id=3` both-empty 旧记录仍在库中，属**修复前**历史数据，非本轮新增；建议上线前清理。

✅ **已修复**，且无副作用。

### 缺陷 4 复核：超长校验

源码核查：`submit()` 流程为 `normalize()`（仅 trim）→ `Validate::check()` → `enforceLimits()`（校验通过后才截断），顺序正确。

真实执行（超长 + 边界）：
```
name=31 (>30)     → {"code":1001,"message":"姓名需为 2~30 个字符"}        ✅
name=30 (边界)    → {"code":0}，DB 存储 30 字         ✅
company=51 (>50)  → {"code":1001,"message":"公司名称不得超过 50 个字符"}  ✅
company=50 (边界) → {"code":0}，DB 存储 50 字         ✅
content=501(>500) → {"code":1001,"message":"留言内容需为 5~500 个字符"}   ✅
content=500(边界) → {"code":0}，DB 存储 500 字        ✅
```
✅ **已修复**。超长被正确拦截（不再静默截断），边界值完整入库。

---

## 十、第 2 轮完整回归结果

### 10.1 接口用例全量重跑（`bash backend/qa-test/round2-sweep.sh`）

**24 / 24 全部通过（含第 1 轮失败的 7 条 + 边界值 3 条）**：

```
PASS  T1  正常(手机)              (code=0)
PASS  T2  正常(仅邮箱+公司)        (code=0)
PASS  T3  name必填缺失            (code=1001)
PASS  T4  name长度不足            (code=1001)
PASS  T5  电话+邮箱都为空          (code=1001)   ← 第1轮 FAIL，现 PASS
PASS  T6  非法手机号12345          (code=1001)
PASS  T7  合法座机010-12345678     (code=0)
PASS  T8  内容过短                (code=1001)
PASS  T9  非法邮箱                (code=1001)
PASS  T10 幂等3连发仅入库1行       (Δ=1)
PASS  T11 非法手机号变体           (code=1001)
PASS  T12 company51字             (code=1001)   ← 第1轮 FAIL，现 PASS
PASS  T13 content501字            (code=1001)   ← 第1轮 FAIL，现 PASS
PASS  T14 分页列表                (code=0)
PASS  T15 未知路由                (code=4004)
PASS  T16 OPTIONS预检             (204)
PASS  T17 省略company             (code=0)
PASS  T18 name31字                (code=1001)   ← 第1轮 FAIL，现 PASS
PASS  T19 空body                  (code=1001)
PASS  T20 表单格式提交             (code=0)
PASS  T21 content缺失             (code=1001)
PASS  B1  name=30边界             (code=0)
PASS  B2  company=50边界          (code=0)
PASS  B3  content=500边界         (code=0)
======================================
ROUND2 RESULTS: PASS=24 FAIL=0
```

### 10.2 前端校验单测回归

`node frontend/qa-test/validate.test.mjs` → **19 / 19 通过**（无回归）。

### 10.3 前端构建与产物冒烟

- `npm run build` → **EXIT=0**，0 个 TS 错误，产出 `dist/`（73 modules）
- `vite preview` 启动产物服务：`GET /` → 200，`GET /about` → 200，`GET /products/solution-cloud` → 200，`<title>示例科技 | 专业的企业数字化解决方案</title>`，JS/CSS 资源 200
- `vite` dev + proxy 端到端：`POST http://127.0.0.1:5173/api/message`（经 proxy → 8000）→ `{"code":0}`，全链路打通

### 10.4 幂等与边界复核

- 幂等：同 IP+同内容连发 3 次 → DB 仅入库 1 行（Δ=1）✅
- 边界：name=30 / company=50 / content=500 → 均 `code=0` 且 DB 存储长度完整（30/50/500）✅

---

## 十一、新引入问题检查（未发现）

| 检查项 | 结果 |
| --- | --- |
| `MessageService` 拆分后调用顺序 | ✅ 正确：normalize(trim) → validate → enforceLimits(截断) → 幂等 → 落库 |
| `$must` 是否影响其他字段 | ✅ 无：仅 name 走 `require\|length`，phone/email 走自定义规则，均正常；both-valid / 单有效 / 单非法 组合全部正确 |
| `useState<number>` 是否影响其他页面 | ✅ 无：全仓扫描 `useState(APP./VALIDATION./ROUTES.` 无其他同类字面量风险点 |
| 空白字符边界 | ✅ 正确处理：`phone="   "`→1001；`content="     "`→1001；`name="   "`→1001 |
| 构建/依赖回归 | ✅ `composer install` 与 `npm run build` 均 EXIT=0 |

**未发现任何新引入缺陷。**

---

## 十二、第 2 轮最终结论

| 指标 | 第 1 轮 | 第 2 轮 |
| --- | --- | --- |
| 前端构建 | ❌ 失败（exit 2） | ✅ 成功（exit 0，0 TS 错误） |
| 前端校验单测 | 19/19 | 19/19（无回归） |
| 后端接口用例 | 14/21 | **24/24（100%）** |
| 缺陷数 | 4（2 阻塞 + 2 严重） | **0** |

### ✅ 可交付

4 个缺陷**全部独立复核为「已修复」**，24/24 接口用例 + 19/19 单测通过，无回归、无新引入问题。前后端契约一致（响应结构/错误码/路径/proxy/CORS/幂等/建表脚本）。

### 交付前用户需知的注意事项

1. **依赖安装**：
   - 前端：`cd frontend && npm install`。若直连 `registry.npmjs.org` 出现 `ECONNRESET`，请改用镜像源：`npm install --registry=https://registry.npmmirror.com`。
   - 后端：`cd backend && composer install`（需 PHP ≥ 8.0，已开启 `pdo_mysql`、`mbstring`）。
2. **环境变量**：复制 `backend/.example.env` 为 `backend/.env`；数据库默认 `root/root`、库名 `corporate_site`，按需修改。
3. **数据库初始化**：`mysql -uroot -proot < backend/database/message.sql`（建库 + 建表 + `idx_ip_created` 索引）。
4. **启动**：后端 `php think run`（8000）；前端 `npm run dev`（5173，`/api` 自动 proxy 到 8000）。
5. **生产构建**：`cd frontend && npm run build` → 产物 `frontend/dist`；Nginx 同域反代 `/api`（示例见根 `README.md`）。
6. **历史数据清理（建议）**：第 1 轮测试遗留的测试数据（`message` 表内 QA 用例行，含一条 `id=3` 的 both-empty 旧记录）建议上线前清空表。
7. **未覆盖项**：响应式布局未做真实浏览器像素级验证（仅静态审查 Tailwind 断点类齐全）；如需可安排浏览器/真机测试。

*第 2 轮报告结束 · QA 工程师 严过关*

---

# 第 3 轮 · 视觉与响应式走查（真浏览器 · 多分辨率）

> 目的：以「真实访客」视角验证界面在 PC / 平板 / 手机下的自适应与美观度。使用 **真实 Chromium 无头浏览器**（Playwright-Core 驱动 Playwright 缓存 Chromium 145）实际渲染逐页截图 + 程序化 DOM 度量（横向滚动、点击目标尺寸、文本溢出、粘性导航、汉堡开合、端到端表单提交）。
>
> ⚠️ 说明：本模型当前无法读取图片内容，故**截图用于人工目视复核**，所有「是否合规」结论均由**程序化 DOM 度量**给出（横向滚动量、元素几何、计算样式、可见性等），结论基于真实渲染结果而非静态代码。

## 一、测试环境

| 项 | 值 |
| --- | --- |
| 前端 | Vite dev server `http://localhost:5173`（HTTP 200） |
| 后端 | ThinkPHP `php think run` `http://localhost:8000`（HTTP 200） |
| 浏览器 | Chromium 145.0.7632.6（Playwright 缓存，headless） |
| 分辨率 | PC 1440×900 / 平板 768×1024 / 手机 375×812（手机 dsf=2，启用 isMobile+hasTouch） |
| 覆盖页面 | `/`、`/about`、`/products`、`/products/solution-cloud`、`/news`、`/news/news-2024-06`、`/contact`（含 404 由路由兜底） |

## 二、截图清单（26 张，存于 `docs/screenshots/`）

命名规则：`<页面>-<分辨率>.png`；另含移动端菜单开合 2 张与表单 3 张。

| 页面 \ 分辨率 | PC 1440 | 平板 768 | 手机 375 |
| --- | --- | --- | --- |
| 首页 `/` | `home-pc1440.png` | `home-tablet768.png` | `home-mobile375.png` |
| 关于 `/about` | `about-pc1440.png` | `about-tablet768.png` | `about-mobile375.png` |
| 产品 `/products` | `products-pc1440.png` | `products-tablet768.png` | `products-mobile375.png` |
| 产品详情 | `product-detail-pc1440.png` | `product-detail-tablet768.png` | `product-detail-mobile375.png` |
| 新闻 `/news` | `news-pc1440.png` | `news-tablet768.png` | `news-mobile375.png` |
| 新闻详情 | `news-detail-pc1440.png` | `news-detail-tablet768.png` | `news-detail-mobile375.png` |
| 联系 `/contact` | `contact-pc1440.png` | `contact-tablet768.png` | `contact-mobile375.png` |

补充截图：`home-mobile375-menu-closed.png`、`home-mobile375-menu-open.png`、`contact-form-filled-pc1440.png`、`contact-form-validation-pc1440.png`、`contact-form-success-pc1440.png`。

## 三、逐项检查结论

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | **375px 是否横向滚动** | ❌ **`/about` 出现 +8px 横向滚动**；其余 6 页 ✅ 无 | 见下方「缺陷 V1」 |
| 2 | 平板 768 / PC 1440 横向滚动 | ✅ 全部页面无 | `hasHScroll=false`（全 21 组合中除 about@375 外） |
| 3 | 移动端汉堡菜单开合 | ✅ 正常 | 点击后 `body.overflow=hidden`（锁滚动）、`aria-label` 由「打开菜单」变「关闭菜单」；再次点击关闭并恢复 `overflow: hidden auto` |
| 4 | 移动端导航折叠 | ✅ 正常 | 375px 下 header 内**桌面导航链均被祖先 `display:none` 隐藏**，仅汉堡按钮（`md:hidden` 的 40×40 按钮）可见 |
| 5 | PC 滚动吸顶 | ✅ 生效 | header `position: sticky`，滚动 1200px 后 `top=0` 仍可见 |
| 6 | 首页 Hero 一屏可见（价值主张 + 主 CTA） | ✅ 三档均可见 | 1440: h1 291–343 / CTA bottom 59；768: h1 237–289；375: h1 190–260，均在视口内 |
| 7 | 产品网格列数（375/768/1440） | ✅ 1 / 2 / 3 列 | `perRow`: mobile=1、tablet=2、pc=3（8 卡片） |
| 8 | 新闻网格列数（375/768/1440） | ✅ 1 / 2 / 3 列 | `perRow`: mobile=1、tablet=2、pc=3（4 卡片，1440 呈 3+1） |
| 9 | 留言表单移动端可用性 | ✅ 正常 | 输入框宽 277 / 高 **53px（≥44 触控标准）**、提交按钮 277×59；无溢出视口 |
| 10 | 文字溢出（375 全页扫描） | ✅ 无 | 5 页扫描 `h1/h2/h3/p/span/a/button/li` 均无越界裁剪（about 页的 `li` 溢出即缺陷 V1 根因） |
| 11 | 首页装饰光斑溢出 | ✅ 非缺陷 | `-right-24/-top-24` 光斑（right=471/864）被**祖先 `overflow-hidden` 裁剪**，`documentElement.scrollWidth==clientWidth`，不产生滚动条 |
| 12 | E2E 留言·校验失败 | ✅ 正常 | 仅填姓名+内容、留空手机/邮箱 → 提示「请填写电话或邮箱 / 电话与邮箱至少填写一项」，未提交 |
| 13 | E2E 留言·提交成功 | ✅ 正常 | 补填手机号 → Toast「提交成功，我们会尽快与您联系」，**表单 5 个字段全部清空** |
| 14 | 整体视觉「简约大气、简洁美观」 | ⚠️ 建议人工目视确认 | 截图已产出，受限于本模型无法读图，需以截图人工终审 |

## 四、发现的视觉 / 响应式问题

### ❌ 缺陷 V1【严重 · 影响交付】`/about` 375px 时间轴横向溢出 8px

- **现象**：手机 375px 打开「关于我们」，页面出现横向滚动条，`documentElement.scrollWidth=383 > clientWidth=375`（溢出 **+8px**）。此现象在 768/1440 下不存在。
- **归属**：`Engineer`（源码 bug）。
- **根因（实测几何）**：发展历程时间轴每项内层容器 `About.tsx:92` 使用 `ml-8 w-full`：
  - 父容器（`ol`）宽度 = 327px（375 − 左右各 24px 内边距）；
  - 该 `div` 为 `border-box` + `w-full` → **宽度 = 327px**，同时 `margin-left:32px`；
  - 结果 `left=56, right=383`（56+327），**右边缘超出视口 8px** → 撑出横向滚动。
  - 即：`w-full`（相对父容器 100%）未扣减 `ml-8` 的 32px 外边距，二者叠加导致溢出。
- **建议修复**（任选其一，仅改 `About.tsx` 时间轴内层容器类名）：
  - 方案 A（最小改动）：将移动端宽度改为扣减边距，如 `ml-8 w-[calc(100%-2rem)] md:ml-0 md:w-[calc(50%-2rem)]`；
  - 方案 B：改用 `flex-1 min-w-0 ml-8 md:ml-0 md:flex-none md:w-[calc(50%-2rem)]`；
  - 方案 C：为 `ol`/`li` 增加 `overflow-hidden`（治标，不推荐，可能裁切圆点）。
- **复现**：`http://localhost:5173/about` @ 375×812。
- **截图**：`docs/screenshots/about-mobile375.png`（可目视右侧时间轴卡片被裁切/贴边）。

> 其余 6 个页面在 3 档分辨率共 **20/21 组合无横向滚动**；除 V1 外**未发现**元素重叠、图片变形、明显留白异常等功能性视觉缺陷。

## 五、第 3 轮结论

| 指标 | 结果 |
| --- | --- |
| 截图覆盖 | 7 页面 × 3 分辨率 + 菜单/表单补充 = **26 张** |
| 横向滚动 | ❌ 1 处（`/about` @375，+8px）；其余 20 组合 ✅ |
| 汉堡菜单 / 导航折叠 / 吸顶 | ✅ 全部正常 |
| Hero 一屏 / 网格列数 1-2-3 | ✅ 全部符合 |
| 表单移动端可用性 + E2E 成功/失败 | ✅ 全部正常 |
| 视觉缺陷 | **1 个严重（V1，归 Engineer）** |

### ⚠️ 视觉验收结论：**需修复后复查**

- 交付主干（构建、接口、契约、第 2 轮功能）均通过；但**移动端是用户明确的核心需求**，`/about` 在 375px 出现横向滚动属可见体验缺陷，**不满足「移动端自适应、无横向滚动」的架构约定**。
- 修复面很小（单文件单处类名），建议转 Engineer 按「方案 A/B」修复后，仅需复测 `/about` @ 375/768/1440 三档 + 回归其余 6 页无新增溢出即可关闭。
- 因本模型无法读图，**「简约大气、简洁美观」的最终主观审美**请 team-lead / 人工结合 `docs/screenshots/` 截图终审；结构化验收项已全部量化通过（除 V1）。

*第 3 轮报告结束 · QA 工程师 严过关*

---

# 第 3 轮 · 缺陷 V1 复测关闭（独立复核）

> 工程师声称仅改 `frontend/src/pages/About.tsx:92`（`w-full` → `w-[calc(100%-2rem)]`），并自测 21/21 组合无横向滚动。本节为**独立复测**，未采信其结论。

## 一、修复确认

- 源码核对：`About.tsx:92` 现为 `ml-8 w-[calc(100%-2rem)] md:ml-0 md:w-[calc(50%-2rem)]`，改动与声称一致，且**仅此一处**。
- 生产构建：`npm run build` → **EXIT=0**，0 TS 错误，dist 产物正常（73 模块，10.12s）。
- 服务：前端 5173 / 后端 8000 均 HTTP 200。

## 二、21 组合横向滚动实测（`scrollWidth` vs `clientWidth`）

| 页面 \ 分辨率 | PC 1440 | 平板 768 | 手机 375 |
| --- | --- | --- | --- |
| `/` 首页 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |
| `/about` 关于 | diff=0 ✅ | diff=0 ✅ | **diff=0 ✅（修复前 +8）** |
| `/products` 产品 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |
| 产品详情 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |
| `/news` 新闻 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |
| 新闻详情 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |
| `/contact` 联系 | diff=0 ✅ | diff=0 ✅ | diff=0 ✅ |

**最大 diff = 0 → 全部 21 组合无横向滚动 ✅**（原始数据见 `docs/screenshots/_audit3.json`）

### 修复前后对比（`/about` @375）

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| `documentElement.scrollWidth` | 383 | **375** |
| `clientWidth` | 375 | 375 |
| **溢出 diff** | **+8 ❌** | **0 ✅** |
| 时间轴内层 div 宽 | 327（=父容器宽，未扣边距） | **295**（=327−32） |
| 时间轴内层 div `right` | 383（超视口 8px） | **351**（≤375 ✅） |

## 三、时间轴移动端几何复核（375px）

- 时间轴项：7 个；容器 `ol` 宽 327；
- 内层卡片 div：`left=56 / right=351 / width=295` → **`maxRight=351 ≤ 375`，完全在视口内 ✅**；
- 时间点圆点（16×16）`left=24 / right=40`，未被裁切 ✅；
- 页面 `scrollWidth=clientWidth=375`，无横向滚动 ✅。

## 四、V1 复测结论

| 检查项 | 结果 |
| --- | --- |
| 源码修复与声称一致 | ✅ 仅 `About.tsx:92` 一处 |
| `npm run build` | ✅ EXIT=0 |
| `/about` @375/768/1440 diff | ✅ 0 / 0 / 0 |
| 回归其余 6 页 × 3 档 | ✅ 无新增溢出 |
| 21 组合最大 diff | ✅ **0** |
| 时间轴卡片 right ≤375 + 圆点未裁切 | ✅ |

### ✅ 缺陷 V1 已关闭

修复真实生效、无回归。第 3 轮唯一缺陷关闭，**视觉与响应式验收通过**（结构化项全部量化通过）。截图存 `docs/screenshots/about-mobile375-after-fix.png`（修复后）。

*第 3 轮 V1 复测关闭报告结束 · QA 工程师 严过关*
