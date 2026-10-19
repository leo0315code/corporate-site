<?php
// +----------------------------------------------------------------------
// | 会话设置
// +----------------------------------------------------------------------

return [
    'name'           => 'PHPSID',
    // SESSION_ID 的提交变量，解决 flash 上传跨域问题
    'var_session_id' => '',
    // SESSION 前缀
    'prefix'         => 'think',
    // 驱动方式，支持 redis/memcache 等
    'type'           => '',
    // 是否自动开启 SESSION
    'auto_start'     => true,
    // httponly 设置
    'httponly'       => true,
    // 安全传输
    'secure'         => false,
];
