<?php
// +----------------------------------------------------------------------
// | CMS 后台配置
// | 后台入口路径前缀由环境变量 CMS_PATH 配置（.env 的 [CMS] 段或顶层 CMS_PATH）
// | env('cms.path') ↔ .env 中的 CMS_PATH
// | 说明：留空 = 后台关闭；此时后端不注册任何管理 API，
// |       且该前缀下的请求返回真正的 HTTP 404，避免被扫描器探测到入口。
// +----------------------------------------------------------------------

return [
    // 后台路径前缀原始值（未做归一化；归一化由全局函数 cms_path() 负责）
    'path' => env('cms.path', ''),

    // Token 有效期（秒），与 AdminSession::TTL_SECONDS 保持一致
    'token_ttl' => 7200,

    // 登录失败阈值与锁定时长（秒）
    'max_fail'     => 5,
    'lock_seconds' => 600,

    // 登录接口限流：同一 IP 每分钟最大请求数
    'rate_limit' => 10,

    // 留言接口限流：同一 IP 在 window 秒内最多 max 次提交（超限 → 1008 / HTTP 429）
    'message_rate_max'    => (int) env('MESSAGE_RATE_MAX', 5),
    'message_rate_window' => (int) env('MESSAGE_RATE_WINDOW', 600),

    // 操作日志保留天数（默认 180 天；清理命令 oplog:clean 未显式传 --days 时使用）
    'oplog_retain_days' => (int) env('OPLOG_RETAIN_DAYS', 180),

    /*
    |--------------------------------------------------------------------------
    | 角色与权限（RBAC，固定三角色 + 模块级权限）
    |--------------------------------------------------------------------------
    | 取舍说明（2026-10 定稿）：
    | - **固定三角色**：不支持后台自定义角色，避免「配出一个能改账号却看不懂日志」的角色；
    | - **模块级权限**：每个模块只区分 `read` / `write`，不做「新增/编辑/删除」细分；
    | - 角色能力用通配符表达：`*` 全权、`product.*` 该模块读写、`product.read` 只读。
    |
    | 权限点命名：`{module}.read` / `{module}.write`
    | 模块清单：product / news / case / advantage / about / site / message / account / oplog / upload
    */
    'roles' => [
        // 超级管理员：全部模块读写（含账号管理、操作日志）
        'admin'  => ['*'],
        // 内容编辑：内容 + 网站配置 + 留言 + 上传；**不含**账号管理与操作日志
        'editor' => [
            'product.*', 'news.*', 'case.*', 'advantage.*', 'about.*', 'site.*',
            'message.*', 'upload.*',
        ],
        // 只读运营：可查看内容与留言，不能写
        'viewer' => [
            'product.read', 'news.read', 'case.read', 'advantage.read',
            'about.read', 'site.read', 'message.read',
        ],
    ],

    // 角色中文名（前端展示；新增角色须同步 frontend/src/constants/index.ts）
    'role_labels' => [
        'admin'  => '超级管理员',
        'editor' => '内容编辑',
        'viewer' => '只读运营',
    ],

    // 新账号默认角色（安全默认：给最小可用权限，由管理员按需提升）
    'default_role' => 'viewer',
];
