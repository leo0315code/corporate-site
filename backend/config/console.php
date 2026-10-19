<?php
// +----------------------------------------------------------------------
// | 控制台配置
// +----------------------------------------------------------------------

return [
    // 指令定义
    'commands' => [
        // CMS 初始化：建表 + 迁移内容种子 + 创建默认管理员（幂等，可重复执行）
        'cms:init' => \app\command\CmsInit::class,
        // 操作日志清理：按保留期分批删除（幂等、不写日志）
        'oplog:clean' => \app\command\OpLogClean::class,
        // 会话清理：过期 admin_session + 历史登录失败计数（幂等）
        'session:clean' => \app\command\SessionClean::class,
        // 站点地图：按数据库内容生成静态 sitemap.xml
        'sitemap:gen' => \app\command\SitemapGen::class,
    ],
];
