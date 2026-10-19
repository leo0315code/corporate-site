<?php
// +----------------------------------------------------------------------
// | 应用路由定义文件
// | 统一响应结构：{ code, message, data }，code=0 表示成功
// | 安全约束：任何未命中路由由 app\ExceptionHandle 统一返回
// |          **真正的 HTTP 404** + JSON 体 {code:4004,...}（形态全站一致）。
// +----------------------------------------------------------------------

use app\middleware\AdminAuth;
use app\middleware\ContentCache;
use app\middleware\LoginThrottle;
use app\middleware\MessageThrottle;
use think\facade\Route;

/**
 * ============ 一、公共分组（始终注册，匿名可访问） ============
 * 前台只读内容接口 + 留言提交。内容读接口统一挂 ContentCache（短 TTL 缓存头）。
 */
Route::group('api', function () {
    // 留言提交（前台匿名；IP 维度限流 → 超限 1008 / HTTP 429）
    Route::post('message', 'Message/submit')->middleware(MessageThrottle::class);

    // 前台内容只读（挂缓存头）
    Route::group(function () {
        Route::get('product/list',     'PublicContent/productList');
        Route::get('product/detail',   'PublicContent/productDetail');
        Route::get('news/list',        'PublicContent/newsList');
        Route::get('news/detail',      'PublicContent/newsDetail');
        Route::get('case/list',        'PublicContent/caseList');
        Route::get('advantage/list',   'PublicContent/advantageList');
        Route::get('about/detail',     'PublicContent/aboutDetail');
        Route::get('site/config',      'PublicContent/siteConfig');
        Route::get('home/summary',     'Home/summary');
    })->middleware(ContentCache::class);
});

/**
 * ============ 二、后台分组（仅当 CMS_PATH 已配置时注册） ============
 * `cms_path()` 归一化后为空串 = 后台关闭：不注册任何管理 API，
 * 此时该前缀下的请求落入 Route::miss → 真正的 HTTP 404，攻击者无法探测入口。
 *
 * 路由命名与 C03/C04/C05 控制器 action 严格一致：
 * - 认证：{P}/api/{login,logout,profile,reset-password,password}
 * - 内容：{P}/api/content/{type}/{list|save|delete}
 * - 留言：{P}/api/message/{list,detail,status,delete}
 * - 账号：{P}/api/admin/{list,create,toggle-status,reset-password,delete}
 */
$cms = cms_path();

if ($cms !== '') {
    Route::group($cms, function () {
        // —— 登录（无需 AdminAuth，挂 LoginThrottle 限流）——
        Route::post('api/login', 'Auth/login')->middleware(LoginThrottle::class);

        // —— 以下整体需 AdminAuth ——
        Route::group('api', function () {
            // 认证
            Route::post('logout',          'Auth/logout');
            Route::get('profile',          'Auth/profile');
            Route::post('reset-password',  'Auth/resetPassword');
            Route::post('password',        'Auth/changePassword');

            // 内容 - 产品
            Route::get('content/product/list',    'Content/productList');
            Route::post('content/product/save',   'Content/productSave');
            Route::post('content/product/delete', 'Content/productDelete');

            // 内容 - 新闻
            Route::get('content/news/list',    'Content/newsList');
            Route::post('content/news/save',   'Content/newsSave');
            Route::post('content/news/delete', 'Content/newsDelete');

            // 内容 - 案例
            Route::get('content/case/list',    'Content/caseList');
            Route::post('content/case/save',   'Content/caseSave');
            Route::post('content/case/delete', 'Content/caseDelete');

            // 内容 - 优势
            Route::get('content/advantage/list',    'Content/advantageList');
            Route::post('content/advantage/save',   'Content/advantageSave');
            Route::post('content/advantage/delete', 'Content/advantageDelete');

            // 内容 - 关于我们
            Route::get('content/about/detail', 'Content/aboutDetail');
            Route::post('content/about/save',  'Content/aboutSave');

            // 网站配置（单例整页读写）
            Route::get('content/site/detail', 'Content/siteDetail');
            Route::post('content/site/save',  'Content/siteSave');

            // 留言管理
            Route::get('message/list',    'Message/adminList');
            Route::get('message/detail',  'Message/detail');
            Route::post('message/status', 'Message/markStatus');
            Route::post('message/delete', 'Message/delete');

            // 账号管理（多管理员，不含 RBAC）
            // 注意：本组 action **不在** AdminAuth::$pwdWhitelist 内 → 未改初始密码时返回 1006
            Route::get('admin/list',            'Admin/adminList');
            Route::post('admin/create',         'Admin/create');
            Route::post('admin/toggle-status',  'Admin/toggleStatus');
            Route::post('admin/reset-password', 'Admin/resetPassword');
            Route::post('admin/delete',         'Admin/delete');

            // 图片上传（multipart/form-data，落在 AdminAuth 之内 → 必须登录）
            Route::post('upload/image', 'Upload/image');

            // 操作日志（只读；挂在 AdminAuth 内 → 必须登录；不在 $pwdWhitelist → 未改初始密码返回 1006）
            Route::get('oplog/list',   'OpLog/list');
            Route::get('oplog/detail', 'OpLog/detail');
        })->middleware(AdminAuth::class);
    });
}

// 根路径健康检查（便于部署自检：GET / 返回 code=0）
Route::get('/', function () {
    return success([
        'service' => 'corporate-site-api',
        'status'  => 'running',
    ]);
});
