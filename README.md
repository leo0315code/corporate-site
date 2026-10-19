# corporate-site（通用企业官网 + CMS 内容管理后台）

> 一套**通用、可复用、可配置**的企业官网模板。前端 Vite + React 18 + React Router v6 + Tailwind CSS，后端 ThinkPHP 8 + MySQL 8。  
> 内容由 **CMS 后台在线维护**，`site.config.ts` / `src/data/*.ts` 仅作空值与接口失败兜底——
> 换企业**不必改代码、不必重新构建**（仅导航菜单、页脚快速链接、主题色仍需改前端配置）。
>
> **本版本新增 CMS 内容管理后台**：在同一 SPA 工程内、以**独立可配置路由前缀**提供后台，
> 在线维护产品 / 新闻 / 案例 / 优势 / 关于我们 5 类内容，以及**网站配置、留言、多账号、操作日志**；
> 前台页面由「静态 import」改为「API 动态读取」，**后台改完刷新前台即生效**，
> 接口失败自动降级到 `src/data/*.ts` 兜底。
> 后台详细使用说明见 **[`docs/CMS-USAGE.md`](docs/CMS-USAGE.md)**。

---

## 一、目录结构

```
aicode/
├── README.md                     # 本文件
├── docs/                         # 设计文档
│   ├── PRD.md                    # 产品需求文档
│   ├── ARCHITECTURE.md           # 系统架构设计与任务分解
│   ├── PRD-CMS.md                # CMS 后台增量 PRD
│   ├── ARCHITECTURE-CMS.md       # CMS 后台增量架构设计 + 任务分解
│   ├── CMS-USAGE.md              # ★ CMS 后台使用说明（登录/各模块/路径配置/初始化/FAQ）
│   ├── class-diagram.mermaid     # 数据结构与接口类图
│   └── sequence-diagram.mermaid  # 留言提交时序图
├── frontend/                     # 前端工程（Vite + React + TS + Tailwind）
│   ├── index.html
│   ├── package.json
│   ├── .env.development / .env.production  # ★ VITE_API_BASE / VITE_CMS_PATH（后台路径）
│   ├── vite.config.ts            # React 插件 + /api 与 {CMS_PATH}/api 代理到 8000
│   ├── tailwind.config.js        # 设计 token 固化（颜色/字体/圆角/断点）
│   ├── postcss.config.js
│   ├── tsconfig.json / tsconfig.node.json
│   ├── public/                   # favicon / OG 封面 / 静态占位图（Logo、产品图、地图已改后台上传，不再放这里）
│   └── src/
│       ├── config/site.config.ts # ★ 站点配置静态兜底（公司/导航/联系/页脚/SEO；除导航/主题色/快速链接外后台可改，此处为空值兜底）
│       ├── data/                 # ★ 内容数据（products/news/about/advantages/cases，兼作降级兜底）
│       ├── types/index.ts        # 全站类型定义
│       ├── constants/index.ts    # 路由常量 ROUTES / CMS_ROUTES + 文案 MESSAGES + 错误码
│       ├── components/           # 通用组件 + Navbar/Footer/MessageForm + cms/*
│       ├── layouts/              # MainLayout + ScrollToTop + CmsLayout（后台壳）
│       ├── sections/             # 首页 6 大区块（数据经 props 下发）
│       ├── hooks/useContent.ts   # ★ 前台内容读取 Hook（加载/错误/降级/重试）
│       ├── pages/                # 页面（前台 6 页 + 404 + pages/cms/* 后台页）
│       ├── router.tsx            # 路由表（按 CMS.PATH 条件注册后台路由）
│       ├── services/api.ts       # 公共 API 封装（超时/错误归一化/内容缓存）
│       ├── services/cms.ts       # ★ 后台管理 API 客户端（Token 注入/错误码分流）
│       └── utils/validate.ts     # 前端校验工具
└── backend/                      # 后端工程（ThinkPHP 8 + MySQL 8）
    ├── composer.json
    ├── .example.env              # 环境变量示例（复制为 .env；含 CMS_PATH）
    ├── think                     # TP 命令行入口
    ├── public/index.php          # 应用入口
    ├── database/cms.sql          # ★ 建表脚本（11 张表，含 message / op_log，幂等 + 存量表加列）
    ├── database/seed/cms-seed.json # ★ 迁移种子（源自 frontend/src/data/*.ts）
    ├── config/                   # 配置（database / app / middleware / cms ...）
    ├── route/app.php             # 路由：公共 /api/*（匿名）+ {CMS_PATH}/api/*（鉴权）
    ├── tests/                    # ★ PHPUnit 用例（sqlite 内存库，不依赖 MySQL）
    └── app/
        ├── common.php            # success() / fail() 统一响应 + cms_path()
        ├── middleware/           # Cors / AdminAuth / LoginThrottle / MessageThrottle / ContentCache
        ├── controller/           # Auth / Content / Home / Message / PublicContent / Admin / Upload / OpLog
        ├── service/              # Auth / Content / Home / Message / Admin / Upload / OpLog(+Context)
        ├── model/                # AdminUser/AdminSession/LoginAttempt/Product/News/.../SiteConfig/OpLog
        ├── validate/             # Auth / Content / Message / Admin 校验器
        └── command/              # cms:init / oplog:clean / session:clean / sitemap:gen
```

---

## 二、环境要求

| 组件       | 版本                | 说明                              |
| -------- | ----------------- | ------------------------------- |
| Node.js  | ≥ 18              | 前端构建                            |
| PHP      | ≥ 8.0（推荐 8.1/8.2） | 后端运行，需开启 `pdo_mysql`、`mbstring` |
| Composer | ≥ 2.x             | 安装 PHP 依赖                       |
| MySQL    | 8.0               | 可用 ServBay 自带，默认账号 `root/root`  |
| Nginx    | 生产部署              | 同域反代 `/api` 与 `{CMS_PATH}/api`（见六） |

---

## 三、快速开始

### 3.1 后端（先启动）

```bash
cd backend

# 1) 安装依赖
composer install

# 2) 准备环境变量：复制示例文件
#    Windows:  copy .example.env .env
#    macOS/Linux:  cp .example.env .env
#    按需修改数据库连接（默认 root/root，库名 corporate_site）
#    并设置后台路径 CMS_PATH（示例：CMS_PATH=/manage-x7k2；留空=后台关闭）

# 3) 建库建表 + 迁移内容 + 创建管理员（幂等，可重复执行）
#    会打印后台初始账号与随机强密码（首次），以及导入统计 8/7/6/4/1
php think cms:init

# 4) 启动服务（默认 http://localhost:8000）
php think run
```

> 自检：浏览器访问 `http://localhost:8000/` 应返回 `{"code":0,"message":"ok","data":{"service":"corporate-site-api","status":"running"}}`。
> `cms:init` 说明见 [`docs/CMS-USAGE.md`](docs/CMS-USAGE.md) 第二节。

### 3.2 前端

```bash
cd frontend

# 1) 安装依赖
npm install

# 2) 配置后台路径（须与后端 CMS_PATH 完全一致；未配置=后台关闭）
#    在 .env.development / .env.production 中设置 VITE_CMS_PATH，例如：
#    VITE_CMS_PATH=/manage-x7k2

# 3) 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

> 开发期前端 `5173`，后端 `8000`，Vite 已配置 `proxy` 把 `/api` 与 `{VITE_CMS_PATH}/api`
> 转发到 `http://localhost:8000`（见 `vite.config.ts`），**无需处理跨域**。
> 后台入口：`http://localhost:5173{你的 VITE_CMS_PATH}`（如 `/manage-x7k2`）。

### 3.3 生产构建

```bash
cd frontend
npm run build        # 产物输出到 frontend/dist
```

### 3.4 自动化测试

后端使用 PHPUnit 11（**sqlite 内存库，不需要 MySQL**，可在 CI 直接跑）：

```bash
cd backend
composer install
php vendor/bin/phpunit          # 41 个用例；--filter 可单跑
```

覆盖的高风险点：登录锁定与防枚举、会话签发、操作日志白名单/截断/旁路写入、
留言校验与幂等、留言限流阈值、错误码 → HTTP 状态映射、后台路径归一化、CORS 白名单、会话滑动续期。

前端类型检查与构建即为其门禁（无单元测试框架，纯逻辑由 `qa-test/` 脚本覆盖）：

```bash
cd frontend
npm run typecheck && npm run build
```

CI：[`.github/workflows/ci.yml`](.github/workflows/ci.yml)，push / PR 时并行跑后端 PHPUnit 与前端类型检查 + 构建。

---

## 四、如何换成另一家企业的官网（重点）

> 绝大多数内容**在后台在线修改即可，无需改代码、无需重新构建**；
> 仅导航菜单、页脚快速链接、品牌主色三项仍走前端配置文件（刻意不开放后台，原因见表）。

| 要替换的内容                     | 修改方式                                        | 说明                                                        |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| 产品 / 新闻 / 案例 / 优势 / 关于我们 | **CMS 后台**对应模块在线增删改                      | `data/*.ts` 仅为迁移数据源 + 接口失败时的降级兜底，改它不影响线上           |
| 公司名 / Logo / 标语 / 简介 / 联系方式 / 页脚（版权、备案号、社交链接）/ SEO | **CMS 后台「网站配置」**单例编辑                  | 逐字段空值回退 `site.config.ts`，后台留空不会导致前台空白               |
| 图片（Logo / 产品图 / 新闻封面 / 案例图 / 地图） | **后台表单内上传**（jpg/png/webp/gif，≤5 MB）   | 落盘 `backend/public/uploads/{type}/`，随机文件名；不支持 SVG；**自动生成 480px WebP 缩略图** |
| 导航菜单 / 页脚快速链接                      | `frontend/src/config/site.config.ts`        | **刻意不开放后台**：配错路径会直接 404；快速链接与导航同源，避免两处不一致     |
| 品牌主色                                | `frontend/tailwind.config.js`（`colors.primary`） | 受构建期 Tailwind 编译约束，运行时改色需整体改 CSS 变量注入（独立课题） |

> **内容类数据（产品/新闻/案例/优势/关于我们）已接入 CMS**：
> 首次通过 `php think cms:init` 从上述 `data/*.ts` 迁移入库；此后线上内容以**数据库为准**
> （后台在线维护）。`data/*.ts` 保留为**迁移数据源 + 前台接口失败时的降级兜底**，
> 直接改它们不会影响线上展示（除非重新迁移或接口降级）。
>
> **站点级配置（公司名 / Logo / 标语 / 简介 / 联系方式 / 页脚 / SEO）同样已接入 CMS**：
> 由后台「网站配置」模块维护（接口 `GET /api/site/config`，前台 Provider 拉取后覆盖静态值）；
> `site.config.ts` 仅作为**空值兜底**与 `nav` / `theme` / `footer.quickLinks` 三个
> 不开放后台的字段的载体。

**修改主色示例**（改为橙红 `#E4572E`）：

```js
// frontend/tailwind.config.js
colors: {
  primary: { DEFAULT: '#E4572E', dark: '#C14420', light: '#FDF0EB' },
  ...
}
```

```ts
// frontend/src/config/site.config.ts
theme: { primary: '#E4572E', secondary: '#0F1B33', accent: '#00B4A6' }
```

---

## 五、CMS 内容管理后台

同域、独立可配置路由前缀的在线后台：维护 5 类内容 + 网站配置 + 留言 + 多账号 + 操作日志。完整说明见
[`docs/CMS-USAGE.md`](docs/CMS-USAGE.md)，此处仅列要点。

### 5.1 能力一览

| 模块 | 路径（`{P}` = 后台前缀） | 能力 |
| --- | --- | --- |
| 登录 / 改密 | `{P}/login`、`{P}/reset-password`、`{P}/password` | 登录（失败锁定 + 限流）、首次强制改密、常规改密 |
| 概览 | `{P}/` | 后台首页 |
| 产品管理 | `{P}/products` | 列表 + 搜索 + 分页；新增 / 编辑 / 删除 |
| 新闻管理 | `{P}/news` | 同上 |
| 案例管理 | `{P}/cases` | 同上 |
| 优势管理 | `{P}/advantages` | 同上（**自增主键**，新增不填 id） |
| 关于我们 | `{P}/about` | 单例整页分区编辑 + 保存（价值观 / 时间轴 / 能力资质可增删） |
| 网站配置 | `{P}/site` | 公司信息 / 联系方式 / 页脚 / 社交链接 / SEO 单例编辑（导航与主题色仍走前端配置） |
| 留言管理 | `{P}/messages` | 列表 + 关键词 + 状态筛选 + 分页；详情（含 IP）；标记待处理/已处理；删除 |
| 账号管理 | `{P}/accounts` | 多管理员：新增（服务端随机强密码，仅返回一次）/ 启停 / 重置密码 / 删除（无 RBAC） |
| 操作日志 | `{P}/logs` | 审计流水只读：模块 / 操作人 / 结果 / 时间范围 / 关键词筛选 + 详情；保留 180 天，`oplog:clean` 清理 |

> 图片上传（`{P}/api/upload/image`）不单独占一页，由产品 / 新闻 / 案例 / 网站配置表单内的 `ImageField` 调用；
> 仅接收 jpg / png / webp / gif（**不收 SVG**，避免同源脚本执行面），≤5 MB，落盘随机文件名。

### 5.2 关键约定

- **后台前缀同值**：前端 `VITE_CMS_PATH` = 后端 `CMS_PATH`；未配置（空）→ 后台整体 404。
- **鉴权**：除登录外，后台 API（`{P}/api/*`）均需 `Authorization: Bearer <token>`；
  未登录 / Token 失效 → `1003` 跳登录；未改初始密码 → `1006` 跳改密页。
- **会话续期**：Token 有效期 2 小时，剩余不足 30 分钟时访问自动顺延 2 小时（滑动续期）。
- **审计**：所有写操作（含登录失败、上传、账号变更）落 `op_log`，写入旁路——日志失败不影响业务。
- **刷新即生效**：后台保存 / 删除成功后前端清除内容缓存，前台刷新即见最新内容。
- **唯一标识 id 创建后不可改**：`id` 直接构成前台详情页 URL，后台编辑态只读；
  后端对「编辑态 + 目标 id 不存在」返回 `4004`（不再静默新建），避免旧链接 404。
- **降级兜底**：前台接口失败时回退 `frontend/src/data/*.ts`，不白屏；恢复后点「重新加载」。

---

## 六、接口说明

统一响应格式：`{ "code": 0, "message": "ok", "data": null }`，`code = 0` 表示成功。

### 6.1 前台公共接口（匿名只读 + 留言提交）

| 方法 | 路径 | 用途 | 参数 |
| --- | --- | --- | --- |
| GET | `/api/product/list` | 产品列表 | `page,size,category,keyword` |
| GET | `/api/product/detail` | 产品详情 | `id`（未命中 → 4004） |
| GET | `/api/news/list` | 新闻列表 | `page,size,category,keyword` |
| GET | `/api/news/detail` | 新闻详情（含上下篇） | `id`（未命中 → 4004） |
| GET | `/api/case/list` | 案例列表（全量） | — |
| GET | `/api/advantage/list` | 优势列表（全量，含 id） | — |
| GET | `/api/about/detail` | 关于我们（单例） | — |
| GET | `/api/site/config` | 站点配置（公司/联系/页脚/SEO） | — |
| GET | `/api/home/summary` | 首页聚合 | `productLimit,newsLimit` |
| POST | `/api/message` | 提交留言 | `name,company,phone,email,content`（同 IP 限流，见 6.4） |

### 6.2 后台管理接口（`{P}/api/*`，除 login 外均需 Bearer Token）

| 分组 | 接口 |
| --- | --- |
| 认证 | `login` / `logout` / `profile` / `reset-password` / `password` |
| 内容 | `content/{product,news,case,advantage}/{list,save,delete}`、`content/about/{detail,save}`、`content/site/{detail,save}` |
| 留言 | `message/{list,detail,status,delete}` |
| 账号 | `admin/{list,create,toggle-status,reset-password,delete}` |
| 上传 | `upload/image`（multipart，字段名 `file`，`type=product|news|case|common`） |
| 审计 | `oplog/{list,detail}`（只读） |

详见 [`docs/CMS-USAGE.md`](docs/CMS-USAGE.md) 与 `docs/ARCHITECTURE-CMS.md` 3.4 节。

### 6.3 错误码表

`code` 为业务码；HTTP 状态码按业务语义映射（便于 Nginx / WAF / 监控按状态码告警与设阈值）。

| code | 含义 | HTTP | 说明 |
| ---- | -------------------------------- | ---- | --- |
| 0    | 成功 | 200 | — |
| 1001 | 参数校验失败 | 400 | message 为具体字段错误 |
| 1002 | 重复提交 | 409 | 幂等审计 |
| 1003 | 未登录 / Token 无效或过期 | 401 | 前端清 Token 跳登录页 |
| 1004 | 账号或密码错误 | 401 | 不区分账号/密码，防枚举 |
| 1005 | 登录失败次数过多（已锁定） | 423 | message 含剩余时间 |
| 1006 | 需要先修改初始密码 | 403 | 前端跳改密页 |
| 1007 | 原密码错误 | 400 | 修改密码场景 |
| 1008 | 请求过于频繁（限流） | 429 | 登录 / 留言接口 |
| 4004 | 资源不存在 | 404 | 含未命中路由与未配置后台路径 |
| 5000 | 服务器内部异常 | 500 | — |

### 6.4 留言防刷

`POST /api/message` 除「同 IP + 同内容 60 秒幂等」外，另有 IP 维度滑动窗口限流：
默认 **10 分钟 5 条**，超限返回 `1008`（HTTP 429）。阈值由 `.env` 的
`MESSAGE_RATE_MAX` / `MESSAGE_RATE_WINDOW` 控制（见 `.example.env`）。

---

## 七、生产部署（Nginx 同域部署示例）

前端 `npm run build` 产物放于 `frontend/dist`，后端 TP8 入口为 `backend/public/index.php`。
Nginx 同域反代 `/api` 与 `{CMS_PATH}/api` 到后端，其余走前端静态产物：

```nginx
server {
    listen 80;
    server_name www.example.com;

    root /var/www/corporate-site/frontend/dist;
    index index.html;

    # ===== 后台上传的图片（勿被下方静态资源正则抢走，^~ 不可省）=====
    location ^~ /uploads/ {
        alias /var/www/corporate-site/backend/public/uploads/;
        # 只放行位图；万一有历史 .svg 也强制下载，避免同源脚本执行
        location ~* \.svg$ {
            add_header Content-Disposition "attachment" always;
            add_header Content-Security-Policy "sandbox" always;
        }
        if ($uri !~* \.(?:jpg|jpeg|png|gif|webp|svg)$) {
            return 403;
        }
        add_header X-Content-Type-Options "nosniff" always;
        expires 30d;
        add_header Cache-Control "public";
    }

    # ===== 后台管理 API（须置于通用 SPA 回退之前）=====
    # {CMS_PATH} 与实际配置一致，例如 /manage-x7k2
    location /manage-x7k2/api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ===== 前台公共 API =====
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ===== 前台 SPA 路由回退（含 /products /news /about 等）=====
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

> 要点：
> - **只**把 `/api` 与 `{CMS_PATH}/api` 反代到后端；后台**页面路由**（如 `{CMS_PATH}/login`）
>   由前端 SPA 处理，通用 `location /` 的 SPA 回退已覆盖，**无需**为后台单独配置回退。
> - 若确需为后台前缀单独加 SPA 回退，务必使其**位于 `{CMS_PATH}/api` 反代规则之后**。
> - `/uploads/` 必须用 `^~` 前缀匹配，否则会被静态资源正则抢走而 404。
> - Windows + ServBay 环境同样适用：`root` 指向 `dist`，反代指向 `php think run` 或 php-cgi 的 8000 端口。

### 7.1 上线检查清单

| 项 | 要求 |
| --- | --- |
| `APP_DEBUG` | **必须** `false`（否则 5000 会回显异常原文）；`APP_TRACE=false` |
| `CMS_PATH` | 前后端一致，且**不是** `admin` / `manage` 之类可猜路径 |
| 目录权限 | `backend/runtime/`、`backend/public/uploads/` 可写；其余目录只读 |
| 目录暴露 | 仅 `backend/public` 作为站点根，`backend/app`、`config`、`.env` **不可**被 Web 访问 |
| 数据库账号 | 生产使用最小权限账号（禁 `DROP`/`GRANT`），勿用 root |
| 跨域 | `CORS_ALLOW_ORIGINS` 显式列白名单；未配置不再回退 `*`，非白名单来源不下发 CORS 头 |
| 上传格式 | 仅 jpg/png/webp/gif（**SVG 已在服务端拒绝**，历史 `.svg` 建议清理） |
| 备份 | `mysqldump` 每日全量 + binlog；`uploads/` 同步备份 |

### 7.2 定时任务（运维必配）

```bash
# 操作日志清理（默认保留 180 天，可 --days 覆盖）
php think oplog:clean
# 过期管理员会话清理（建议与上一条同频执行）
php think session:clean
# 站点地图生成（写入 frontend/public/sitemap.xml，构建后随 dist 发布）
# 换域名后先改 .env 的 SITE_URL，再重新生成 + 重新构建前端
php think sitemap:gen
```

- Linux：`crontab -e` 加 `0 3 * * * cd /var/www/corporate-site/backend && php think oplog:clean && php think session:clean`
- Windows：任务计划程序创建每日 03:00 任务，程序填 `php.exe`，参数 `think oplog:clean`，起始于 `backend` 目录。
- 未配置定时任务不影响功能，但 `op_log` / `admin_session` 会持续增长。
- **内容更新后**建议追加执行 `php think sitemap:gen`（或在发布脚本里串联），保证 sitemap 与线上一致；
  `robots.txt` 与 `og-cover.png` 位于 `frontend/public/`，随构建一起发布，无需额外配置。

### 7.3 构建与 SEO 预渲染

前台是纯 SPA，`<title>` / `meta` 由 React 运行时写入，爬虫与社交分享抓取常常拿不到内容级元信息。
构建后执行一次预渲染脚本，可为每条路由生成**独立 HTML 副本**（重写 head 元信息 + `<noscript>` 内链）：

```bash
cd frontend
npm run build:seo        # = npm run build && npm run prerender
# 或分开执行，显式指定域名与后端地址
npm run prerender -- --base https://your-domain.com --api http://127.0.0.1:8000/api
```

| 项 | 说明 |
| --- | --- |
| 产物 | `dist/index.html` + `dist/{products,news,about,contact}/index.html` + 每条产品/新闻的 `dist/{products,news}/<id>/index.html`（与 sitemap 同源，通常 20 条） |
| 重写内容 | `<title>`、`description`、`keywords`、`canonical`、`og:title/description/url/type`、Organization JSON-LD 的 `url`、`<noscript>` 导航 |
| 不做的事 | **不注入 React 树**（因此不会与 `createRoot` 冲突、无需 hydration），页面数据的可见性仍依赖 JS |
| 降级 | 后端不可达时只生成 5 个静态页，用构建产物里的默认元信息，不会失败退出 |
| 幂等 | 可重复执行：每次先剥离上一次生成的 `<noscript>` 块，不叠加 |
| CI | 不参与（CI 只跑 typecheck + build），属**发布期**步骤，需后端与库可用 |

> `sitemap:gen`（后端）与 `prerender`（前端）用同一批路由，替换域名后两者都要重跑；
> 建议在发布脚本里固定顺序：`sitemap:gen` → `build` → `prerender`。

### 7.4 上传图片的派生图

后台上传成功后会自动生成两类派生文件（**失败静默降级，不影响上传**）：

| 派生 | 规则 | 用途 |
| --- | --- | --- |
| 缩略图 | `<随机名>_thumb.webp`，宽 ≤480，WebP q80 | 列表页 / 首页卡片（前端 `ThumbImage` 按命名约定自动替换，缺失时回退原图） |
| 原图压缩 | jpg/webp 且 >800KB **或** 长边 >1920 → 缩至 1920、质量 82 原地重编码 | 控制详情页体积 |

- GIF 不生成缩略图（保留动图）；PNG 不重编码（无损，收益有限）。
- 历史图片没有缩略图，前端会自动回退原图，**无需迁移**；如需补齐，重新上传即可。
- 依赖 PHP `gd` 扩展（CI 已开启），缺失时自动跳过派生。

---

## 八、常见问题

1. **前端请求 404 / 跨域？**  
   确认后端已启动在 `8000`；开发期依赖 Vite proxy（`vite.config.ts` 的 `server.proxy`）。
2. **留言提交 / 后台 500，数据库错误？**  
   确认已执行 `php think cms:init`（建表 + 迁移），且 `.env` 中数据库名/账号密码正确。
3. **后台地址 404？**  
   确认前后端 `VITE_CMS_PATH` / `CMS_PATH` 已配置且**完全一致**，并已重启前后端服务。
4. **`php think run` 端口被占用？**  
   使用 `php think run -p 8001` 并同步修改 `frontend/vite.config.ts` 的 proxy 目标。
5. **留言提交返回 `1008`（HTTP 429）？**  
   触发 IP 维度限流（默认 10 分钟 5 条），等待窗口结束或调整 `.env` 的 `MESSAGE_RATE_MAX` / `MESSAGE_RATE_WINDOW`。
6. **不装 MySQL 想快速体验？**  
   `backend/.env` 设 `TYPE = sqlite`，并准备 sqlite 驱动与库文件（备选方案）。

---

*交付物：前端工程 + 后端工程 + CMS 内容管理后台 + 配置/数据文件 + 使用说明与部署示例。*
