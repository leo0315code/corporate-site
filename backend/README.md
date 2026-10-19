# corporate-site backend（ThinkPHP 8 + MySQL 8）

企业官网后端服务，仅提供留言相关接口（纯 API，不做模板渲染）。

## 环境要求

- PHP ≥ 8.0（推荐 8.1/8.2），需开启 `pdo_mysql`、`mbstring`
- Composer ≥ 2.x
- MySQL 8.0（默认 `root/root`，库名 `corporate_site`）

## 启动步骤

```bash
cd backend

# 1) 安装依赖
composer install

# 2) 环境变量（复制示例文件）
#    Windows:      copy .example.env .env
#    macOS/Linux:  cp .example.env .env

# 3) 建库建表
mysql -uroot -proot < database/message.sql

# 4) 启动（默认 http://localhost:8000）
php think run
```

健康检查：`GET http://localhost:8000/` → `{"code":0,"message":"ok","data":{"service":"corporate-site-api","status":"running"}}`

## 目录结构（业务相关）

```
backend/
├── app/
│   ├── common.php               # success() / fail() 统一响应封装
│   ├── middleware.php           # 全局中间件注册（Cors）
│   ├── middleware/Cors.php      # 跨域中间件
│   ├── controller/Message.php   # 留言控制器（submit / list）
│   ├── service/MessageService.php # 业务编排（校验/幂等/落库/分页）
│   ├── model/Message.php        # 留言模型（时间戳/防重复查询）
│   ├── validate/MessageValidate.php # 验证器（规则与前端一致）
│   └── ExceptionHandle.php      # 统一异常 → 错误码映射
├── config/database.php          # 数据库连接（读 .env）
├── route/app.php                # 路由定义
├── database/message.sql         # 建表脚本
└── public/index.php             # 应用入口
```

## 接口

### POST /api/message —— 提交留言（P0）

请求（JSON）：

```json
{
  "name": "张先生",
  "company": "示例公司",
  "phone": "13800000000",
  "email": "",
  "content": "想了解产品报价"
}
```

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| name | 是 | 2~30 字符 |
| company | 否 | ≤ 50 字符（可空） |
| phone | 条件必填 | 手机/座机格式；与 email 至少填一项 |
| email | 条件必填 | 邮箱格式；与 phone 至少填一项 |
| content | 是 | 5~500 字符 |

成功：`{"code":0,"message":"ok","data":null}`
失败：`{"code":1001,"message":"姓名需为 2~30 个字符","data":null}`

**防重复提交（幂等）**：同 IP + 同内容在 60 秒内重复提交，直接返回成功（`code=0`）但不重复入库。

### GET /api/message/list —— 留言列表（P2）

参数：`page`（默认 1）、`size`（默认 10，最大 50）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "total": 1,
    "page": 1,
    "size": 10,
    "items": [
      { "id": 1, "name": "张先生", "company": "示例公司", "phone": "13800000000",
        "email": "", "content": "想了解产品报价", "ip": "127.0.0.1",
        "created_at": "2025-01-01 10:00:00" }
    ]
  }
}
```

## 错误码

| code | 含义 |
| --- | --- |
| 0 | 成功 |
| 1001 | 参数校验失败 |
| 1002 | 重复提交（幂等，仅审计日志） |
| 4004 | 资源不存在 |
| 5000 | 服务器内部异常 |

## 测试示例

```bash
# 提交留言
curl -X POST http://localhost:8000/api/message \
  -H "Content-Type: application/json" \
  -d '{"name":"张先生","company":"示例公司","phone":"13800000000","email":"","content":"想了解产品报价"}'

# 校验失败
curl -X POST http://localhost:8000/api/message \
  -H "Content-Type: application/json" \
  -d '{"name":"张","phone":"","email":"","content":"hi"}'

# 留言列表
curl "http://localhost:8000/api/message/list?page=1&size=10"
```

## 换数据库

修改 `.env` 的 `[DATABASE]` 段即可（库名/账号/密码/端口）。主机名默认 `127.0.0.1`，库名默认 `corporate_site`。
