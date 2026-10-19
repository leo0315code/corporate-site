<?php
declare(strict_types=1);

/**
 * PHPUnit 引导文件
 *
 * 目标：**不依赖 MySQL** 跑通核心业务用例。
 * 做法：以 sqlite 单文件库替换默认连接（`database.default = test`），
 * 并在引导阶段建好测试所需的最小表结构；每个用例自行清表保证隔离。
 *
 * 注意：
 * - 必须在本文件内完成「配置覆盖 + 建表」，早于任何模型查询；
 * - 测试库文件落在 `runtime/tests/`（已被 .gitignore 忽略），每次运行前重建。
 */

use think\App;
use think\facade\Db;

require dirname(__DIR__) . '/vendor/autoload.php';

$root = dirname(__DIR__);

/** @var App $app */
$app = new App($root . DIRECTORY_SEPARATOR);
$app->initialize();

// —— 1) 切换到 sqlite 测试库 ——
$dbFile = $root . '/runtime/tests/test.sqlite';
$dbDir  = dirname($dbFile);

if (!is_dir($dbDir) && !mkdir($dbDir, 0777, true) && !is_dir($dbDir)) {
    fwrite(STDERR, "无法创建测试库目录：{$dbDir}\n");
    exit(1);
}

if (is_file($dbFile)) {
    @unlink($dbFile);
}
touch($dbFile);

$dbConfig                = $app->config->get('database');
$dbConfig['default']     = 'test';
$dbConfig['connections']['test'] = [
    'type'     => 'sqlite',
    'database' => $dbFile,
    'prefix'   => '',
    'charset'  => 'utf8mb4',
    'debug'    => false,
];
$app->config->set($dbConfig, 'database');

// —— 2) 建表（sqlite 方言，仅覆盖用例所需列） ——
$tables = [
    'admin_user' => <<<'SQL'
CREATE TABLE admin_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 1,
    is_primary INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT NULL,
    last_login_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NULL,
    updated_at TEXT NULL
)
SQL,
    'admin_session' => <<<'SQL'
CREATE TABLE admin_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL DEFAULT 0,
    token TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NULL,
    updated_at TEXT NULL
)
SQL,
    'login_attempt' => <<<'SQL'
CREATE TABLE login_attempt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL DEFAULT '',
    scope_key TEXT NOT NULL DEFAULT '',
    fail_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT NULL,
    last_failed_at TEXT NULL,
    created_at TEXT NULL,
    updated_at TEXT NULL
)
SQL,
    'message' => <<<'SQL'
CREATE TABLE message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    company TEXT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    handled_at TEXT NULL,
    created_at TEXT NULL
)
SQL,
    'op_log' => <<<'SQL'
CREATE TABLE op_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL DEFAULT 0,
    admin_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    module TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    target_name TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    result INTEGER NOT NULL DEFAULT 1,
    detail TEXT NOT NULL DEFAULT ''
)
SQL,
    'product' => <<<'SQL'
CREATE TABLE product (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    description TEXT NULL,
    features TEXT NULL,
    image TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    created_at TEXT NULL,
    updated_at TEXT NULL
)
SQL,
    'news' => <<<'SQL'
CREATE TABLE news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    date TEXT NULL,
    category TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NULL,
    created_at TEXT NULL,
    updated_at TEXT NULL
)
SQL,
];

foreach ($tables as $name => $ddl) {
    Db::execute('DROP TABLE IF EXISTS ' . $name);
    Db::execute($ddl);
}
