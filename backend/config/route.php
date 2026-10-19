<?php
// +----------------------------------------------------------------------
// | 路由设置
// +----------------------------------------------------------------------

return [
    // pathinfo 分隔符
    'pathinfo_depr'           => '/',
    // 是否自动转换URL中的控制器和操作名
    'url_convert'             => true,
    // 默认的访问控制器层
    'url_controller_layer'    => 'controller',
    // 伪静态后缀
    'url_html_suffix'         => 'html',
    // 是否强制使用路由
    'url_route_must'          => false,
    // 合并路由规则
    'route_rule_merge'        => false,
    // 路由是否完全匹配
    'route_complete_match'    => false,
    // 是否开启路由延迟解析
    'url_lazy_route'          => false,
    // 是否使用注解路由
    'route_annotation'        => false,
    // 默认的路由变量规则
    'default_route_pattern'   => '[\w\.]+',
    // 请求缓存规则
    'request_cache'           => false,
    // 全局请求缓存，开启后支持自动缓存
    'request_cache_expire'    => null,
    // 控制器中间件合并
    'controller_layer_middle' => false,
];
