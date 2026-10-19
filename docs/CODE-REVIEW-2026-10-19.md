# corporate-site 整体技术与工程分析

> 分析时间：2026-10-19 | 范围：`backend/` + `frontend/` + `docs/` + `qa-visual/`
> 方式：静态代码审查 + 构建验证 + 运行时接口冒烟（PHP 8.3.33 / ThinkPHP 8 / Vite 5）

---

## 一、总体结论

**代码质量处于"可交付生产"水平，分层清晰、注释与设计文档密度高；真正的短板在工程化（无版本控制、无自动化测试、无 CI）与运营侧（留言防刷、SEO、上传资源治理）。**

| 维度 | 评分 | 说明 |
| --- | --- | --- |
| 架构与分层 | 9.0 / 10 | Controller 薄、Service 厚、Model 只做数据，中间件按路由分组挂载，边界干净 |
| 代码质量与一致性 | 9.0 / 10 | `declare(strict_types=1)`、PHPDoc 完备、命名统一、无 TODO/FIXME、无硬编码密钥 |
| 安全 | 7.5 / 10 | bcrypt + 计时哑元哈希、Token 强格式校验、后台前缀 404 隐形、上传双校验；扣分在 SVG 同源执行与留言无频控 |
| 工程化（版本/测试/CI） | 4.0 / 10 | **无 .git**、无 PHPUnit/Vitest、无 CI，验证依赖手工脚本 |
| 文档 | 7.0 / 10 | 08 篇 6388 行设计文档详实；但 **README 已落后于代码**（缺 4 个模块） |
| 前端体验与性能 | 8.5 / 10 | 路由级懒加载、双层缓存带代际防竞态、`no-store` 绕 HTTP 缓存，首屏 gzip 78 KB |
| SEO / 内容运营 | 6.0 / 10 | 纯运行时写 meta，无 SSR/预渲染、无 sitemap/robots |

---

## 二、实测结果

**构建与静态检查**

| 项 | 结果 |
| --- | --- |
| 后端 `php -l`（app/config/route 全量 62 文件） | ✅ 0 error |
| 前端 `tsc --noEmit` | ✅ 0 error |
| 前端 `vite build` | ✅ 5.12s，`dist` 601 KB，主包 238.73 KB（gzip 78.03 KB） |
| 遗留标记 `TODO/FIXME/XXX/HACK` | ✅ 0 处 |
| 原生 SQL 拼接 | ✅ 仅 `cms:init` 执行建表脚本，业务层全部 ORM 参数绑定 |
| 前端 `dangerouslySetInnerHTML` / `console.log` | ✅ 0 处 |

**运行时冒烟（`php think run -p 8010`）**

| 用例 | 结果 |
| --- | --- |
| `GET /` 健康检查 | ✅ `{"code":0,...,"status":"running"}` |
| `GET /api/product/list?size=2` | ✅ 正常返回，`total=8` |
| `GET /api/case/list` 响应头 | ✅ `Cache-Control: public, max-age=60` |
| 未带 Token 访问后台 API | ✅ `1003 请先登录` |
| 错误前缀 `/nope-x/api/login` | ✅ **HTTP 404**（后台入口不可探测） |
| SQL 注入 `keyword=' or 1=1-- ` | ✅ `total=0`；`size=9999` 被钳制为 50 |
| 错误密码登录 | ✅ `1004`，且 `op_log` 由 6 → 7（审计落库生效） |

**数据基线**：11 张表；`product 8 / news 7 / case_item 6 / advantage 4 / about 1 / site_config 1 / message 37 / op_log 7 / admin_user 2 / admin_session 0`。

**代码规模**：后端 PHP 7,827 行；前端 TS/TSX 12,959 行；文档 6,388 行。

---

## 三、做得好的地方（应保持）

1. **鉴权链完整**：`AdminAuth` 五步顺序（Token → 会话 → 账号状态 → 强制改密闸门 → 注入上下文）无跳步；`must_change_password` 白名单只放 4 个 action，逻辑正确。
2. **防枚举做得细**：账号不存在时对 `DUMMY_HASH` 跑一次 `password_verify()` 对齐耗时；登录失败文案与错误码不区分账号/密码。
3. **审计旁路化**：`OpLogService::record()` 全 try/catch，写日志失败绝不影响主流程；`buildRow()` 白名单 + `array_intersect_key` 收口，杜绝"顺手多记敏感字段"。
4. **上传七道防线**：类型白名单 → `isValid()` → 5 MB 上限 → finfo 真实 MIME → MIME×扩展名交叉校验 → 随机文件名 → 目录加固（Apache `.htaccess` + Nginx `^~` 块）。
5. **后台路径隐形**：`CMS_PATH` 为空即不注册路由，错误前缀返回真 404，扫描器无法区分。
6. **前端缓存工程化**：`cacheEpoch` 代际号解决"清缓存与在途请求竞态"；内容 GET 显式 `no-store`，避免 `max-age=60` 与后台"保存即生效"承诺打架。
7. **前端路由注入受控**：后台路由仅在 `CMS.PATH !== ''` 时注册，路径全部来自 `CMS_ROUTES` 常量。

---

## 四、问题清单（按优先级）

### P0 — 影响可回滚性，建议今天就做

**1. 项目没有版本控制。** 根目录只有 `.gitignore`，不存在 `.git`；`git status` 报 `not a git repository`。

- 风险：任何一次误改/误删都不可回滚；无提交历史可审计；无法开分支做实验；无法上 CI。
- 建议：`git init` → 首次提交 `chore: baseline`（`.gitignore` 已就绪，`vendor/node_modules/dist/.env/uploads/*` 均已排除，可直接提交）→ 远端私有仓库。首次提交前确认 `backend/.env`（含 MySQL `root/root`）未被跟踪。

### P1 — 生产前必须处理

**2. 留言接口无频控，可被灌库。** `MessageService::submit()` 只有"同 IP + 同内容 60 s 幂等"，不同内容可无限提交；`LoginThrottle` 只保护登录接口。

- 建议：对 `POST /api/message` 加同 IP 限流（如 10 条/10 分钟，复用 `LoginThrottle` 思路，key 改 `message:rate:<ip>`），必要时叠加蜜罐字段/极简算术验证。`message` 表已有 `idx_ip_created`，可直接按 IP+时间窗计数落库兜底。

**3. 无自动化测试、无 CI。** `composer.json` 无 PHPUnit，`package.json` 无 `test` 脚本；`backend/qa-test/` 与 `frontend/qa-test/` 是一次性脚本；`docs/TEST-REPORT.md` 停在 10-16（CMS 之前）。

- 建议：先用最小成本补两条防线——① PHPUnit 覆盖 6 个高风险点（登录锁定、强制改密、上传校验、oplog 白名单、留言校验、后台 404）；② GitHub Actions 跑 `php -l` + `tsc --noEmit` + `vite build` + PHPUnit。有了 git 才能接 CI（依赖 P0）。

**4. README 与代码严重脱节。** README 中 `oplog / 操作日志 / upload / 账号管理 / site config / 网站配置` 关键词命中 **0 次**；实际已上线"图片上传、多账号管理、网站配置、操作日志"4 个模块。

- 影响：新人/接手方按 README 操作会漏掉一半后台能力，且看不到 `oplog:clean` 运维项。
- 建议：README 增补三处——能力清单表、接口表、运维项（`oplog:clean` 定时任务、`APP_DEBUG=false`、uploads 反代）；细节继续引用 `docs/CMS-USAGE.md`（该文档已覆盖，勿重复）。

**5. 业务错误一律 HTTP 200。** `fail()` 只设置 JSON 体，不改状态码；`1003/1004/1005/1008/5000` 全为 200。

- 影响：Nginx 日志、WAF、云监控无法按状态码识别异常；告警只能靠业务码解析。
- 建议：`fail()` 增加状态码映射（1003→401、1006→403、4004→404、1008→429、5000→500），前端 `request()` 已按 code 分流，改为非 200 不构成回归（需回归验证 `api.ts` 的 `response.ok` 用法）。

### P2 — 优化项，按运营节奏排

**6. SVG 上传存在同源脚本执行面。** `MIME_EXT_MAP` 放行 `image/svg+xml`，落盘在 `public/uploads/*`，Nginx 也放行 `.svg`；直接访问 `https://站点/uploads/common/x.svg` 时浏览器会**以文档方式执行其中脚本**，可读取 `localStorage` 里的管理 Token（`<img src>` 引用不执行，但"右键新窗口打开/直接分享链接"会）。

- 建议（任一）：① 取消 SVG 支持（改用 PNG/WebP，图标本可用 `ProductIcon` 组件）；② 仅对 `.svg` 返回 `Content-Disposition: attachment` + `Content-Security-Policy: sandbox`；③ 上传域名独立。推荐 ①，成本最低且当前内容里 SVG 仅作占位图。

**7. 会话不续期、过期数据无清理。** `AdminSession::TTL_SECONDS = 7200` 固定，无滑动续期、无"记住我"；`purgeExpired()` 已实现但**全项目无调用点**；`oplog:clean` 也未接调度。

- 建议：访问时按剩余时间 < 30 min 顺延到期（写一次 `expires_at`）；`admin_session` 过期清理挂到 `oplog:clean` 同一 cron（或独立 `session:clean`），Windows 服务器用计划任务，Linux 用 crontab。文档需补"运维定时任务"小节。

**8. CORS 未命中白名单时回退 `*`。** `Cors::resolveOrigin()` 对任意来源返回 `*`（仅开发期便利，注释已标注）。

- 建议：白名单改为读环境变量；生产未命中直接不回 CORS 头（同域部署本就不需要）。

**9. 内容主键用 slug，改标识即换 URL。** `product/news/case_item` 的 `id` 是 `VARCHAR(80)` 业务标识，后台改 id 等于前台 URL 变更，且无 301 映射。

- 建议：后台表单把 id 标注为"创建后不可修改，修改将改变前台链接"（若尚未如此）；后续需要时加 `slug_history` 表做 301。

**10. SEO 结构性短板。** 纯 SPA，`SEO` 组件运行时写 `document.title/meta`；`public/` 下无 `robots.txt`、`sitemap.xml`；无 OG 图片、无 JSON-LD。

- 影响：百度/必应对纯客户端渲染收录不稳定；微信/社交分享卡片拿不到标题图。
- 建议：轻量方案（不上 SSR）——构建后预渲染首页与 5 个静态页（`vite-plugin-prerender` 或自写 Puppeteer 脚本，`qa-visual` 已有 Puppeteer 能力可复用）；补 `robots.txt` + 由后端 `sitemap.xml` 接口生成（内容在库，天然同步）；`og:image` 用固定品牌图。

**11. 上传无压缩、无缩略图。** 原图直出（≤5 MB），列表页按原图加载。

- 建议：上传后生成 `_{w}px` 派生图或转 WebP（GD/Imagick 均可），列表页用缩略图；当前数据量小，非紧急。

**12. `ContentService` 体量偏大（1,146 行）。** 列表/详情/保存/删除 + 关于我们 + 网站配置 + 序列化 + 多种 `normalize*` 混杂。

- 建议：按领域拆 `ContentService`（产品/新闻/案例/优势 CRUD）、`AboutService`、`SiteConfigService`，序列化抽 `ContentSerializer`。属于纯重构，务必在 P0/P1 之后、有测试兜底时再做。

---

## 五、建议执行顺序

| 批次 | 内容 | 交付判据 |
| --- | --- | --- |
| 第 1 批（今天） | git init + 首次提交；README 补齐 4 个模块 | `git log` 有基线提交；README 关键词命中 |
| 第 2 批（本周） | 留言限流；PHPUnit 6 个高风险用例 + CI；`fail()` 状态码映射 | 测试全绿；灌库脚本被 429；curl 返回真实状态码 |
| 第 3 批（上线前） | SVG 策略收敛；会话续期 + 定时清理；CORS 收紧 | 上传仅剩位图；cron 跑通；跨域按白名单 |
| 第 4 批（运营期） | 预渲染 + sitemap/robots；图片派生；Service 拆分 | Lighthouse SEO ≥ 90；列表页图片体积下降；单测覆盖重构 |

---

## 六、附：关键文件索引

| 关注点 | 文件 |
| --- | --- |
| 鉴权闸门 | `backend/app/middleware/AdminAuth.php` |
| 审计写入 | `backend/app/service/OpLogService.php` / `OpLogContext.php` |
| 上传防线 | `backend/app/service/UploadService.php` |
| 内容 CRUD | `backend/app/service/ContentService.php` |
| 留言提交 | `backend/app/service/MessageService.php`（`submit()`） |
| 统一响应/错误码 | `backend/app/common.php` |
| 全局异常 | `backend/app/ExceptionHandle.php` |
| 前端内容缓存 | `frontend/src/services/api.ts` / `hooks/useContent.ts` |
| 后台路由注入 | `frontend/src/router.tsx` |
| 部署反代 | `README.md` 第七节 / `docs/CMS-USAGE.md` 第六节 |
