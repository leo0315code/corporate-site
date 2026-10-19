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

    // 操作日志保留天数（默认 180 天；清理命令 oplog:clean 未显式传 --days 时使用）
    'oplog_retain_days' => (int) env('OPLOG_RETAIN_DAYS', 180),
];
