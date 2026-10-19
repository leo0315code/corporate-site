<?php
// +----------------------------------------------------------------------
// | PHP 内置服务器路由转发脚本
// | 用于 `php think run` 或 `php -S localhost:8000 public/router.php`
// | 静态文件直接返回，其余请求交给 index.php 处理
// +----------------------------------------------------------------------

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// 命中真实存在的静态文件则直接返回（交由内置服务器处理）
if ($path !== '/' && is_file(__DIR__ . $path)) {
    return false;
}

// 其余请求统一走应用入口
$_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/index.php';
require __DIR__ . '/index.php';
