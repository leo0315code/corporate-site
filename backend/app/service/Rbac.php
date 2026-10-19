<?php
declare(strict_types=1);

namespace app\service;

use think\facade\Config;

/**
 * 角色权限（RBAC）判定
 *
 * 模型（2026-10 定稿）：
 * - **固定三角色**：`admin`（超级管理员）/ `editor`（内容编辑）/ `viewer`（只读运营）；
 * - **模块级权限**：每模块只有 `read` / `write` 两种动作，不做「新增/编辑/删除」细分；
 * - 权限点：`{module}.read` / `{module}.write`，角色配置见 `config/cms.php` 的 `roles`，
 *   支持通配：`*`（全部）、`product.*`（该模块读写）。
 *
 * 判定入口只有两个：`allows()`（放行判定）与 `permissionsOf()`（下发给前端做菜单/按钮隐藏）。
 * **前端隐藏不是安全边界**：所有写操作仍由 `AdminAuth` 在服务端二次判定。
 *
 * 安全默认：
 * - 角色值非法/为空 → 按 `viewer` 处理（最小权限），不因脏数据放开权限；
 * - 未登记的控制器 → 视为「自助类接口」（如 auth 改密），不纳入 RBAC；
 *   新增业务控制器时**必须**在 `CONTROLLER_MODULE` 登记模块，否则默认放行。
 */
final class Rbac
{
    /** 支持的角色（与 config/cms.php 的 roles 键一致） */
    public const ROLES = ['admin', 'editor', 'viewer'];

    /** 受管模块（与后台导航一一对应） */
    public const MODULES = [
        'product', 'news', 'case', 'advantage', 'about', 'site',
        'message', 'account', 'oplog', 'upload',
    ];

    /** 动作类型 */
    public const READ  = 'read';
    public const WRITE = 'write';

    /**
     * 控制器 → 模块
     *
     * `content` 为聚合控制器（产品/新闻/案例/优势/关于/网站配置），模块由 action 前缀解析；
     * 未列出的控制器（如 `auth`）不纳入 RBAC——它们是登录后人人可用的自助接口。
     * @var array<string, string|null>
     */
    protected const CONTROLLER_MODULE = [
        'content' => null,      // 由 action 前缀决定
        'admin'   => 'account', // 账号管理
        'oplog'   => 'oplog',   // 操作日志
        'upload'  => 'upload',  // 图片上传
    ];

    /**
     * 归一化角色值（未知角色按最小权限处理）
     *
     * @param mixed $role 数据库/请求中的角色值
     * @return string 合法角色名
     */
    public static function roleOf(mixed $role): string
    {
        $value = is_scalar($role) ? strtolower(trim((string) $role)) : '';

        return in_array($value, self::ROLES, true) ? $value : 'viewer';
    }

    /**
     * 展开角色的权限点列表（通配符展开为具体 `{module}.read|write`）
     *
     * @param string $role 角色名
     * @return string[] 例如 ['product.read','product.write',...]
     */
    public static function permissionsOf(string $role): array
    {
        $role  = self::roleOf($role);
        $rules = (array) Config::get('cms.roles.' . $role, []);
        $all   = [];

        foreach (self::MODULES as $module) {
            $all[] = $module . '.' . self::READ;
            $all[] = $module . '.' . self::WRITE;
        }

        $result = [];
        foreach ($rules as $rule) {
            $rule = trim((string) $rule);
            if ($rule === '*') {
                $result = $all;
                break;
            }
            if (str_ends_with($rule, '.*')) {
                $module = substr($rule, 0, -2);
                if (in_array($module, self::MODULES, true)) {
                    $result[] = $module . '.' . self::READ;
                    $result[] = $module . '.' . self::WRITE;
                }
                continue;
            }
            if (in_array($rule, $all, true)) {
                $result[] = $rule;
            }
        }

        $result = array_values(array_unique($result));
        sort($result);

        return $result;
    }

    /**
     * 判定是否允许某动作
     *
     * @param string $role   角色名
     * @param string $module 模块名（见 `MODULES`）
     * @param string $action `read` 或 `write`
     * @return bool
     */
    public static function allows(string $role, string $module, string $action): bool
    {
        if (!in_array($module, self::MODULES, true)) {
            // 未登记模块：保守拒绝，避免新增模块时被无意放开
            return false;
        }
        $action = $action === self::WRITE ? self::WRITE : self::READ;

        return in_array($module . '.' . $action, self::permissionsOf($role), true);
    }

    /**
     * 解析「控制器 + action」对应的模块
     *
     * @param string $controller 控制器名（`$request->controller()`，已含命名空间尾段）
     * @param string $action     方法名（`$request->action()`）
     * @return string|null 模块名；null 表示不纳入 RBAC（自助接口）
     */
    public static function moduleOf(string $controller, string $action): ?string
    {
        $controller = strtolower($controller);

        if (!array_key_exists($controller, self::CONTROLLER_MODULE)) {
            return null;
        }

        $mapped = self::CONTROLLER_MODULE[$controller];
        if ($mapped !== null) {
            return $mapped;
        }

        // 聚合控制器：按 action 前缀（productList / aboutSave / siteDetail …）判断
        $action = strtolower($action);
        foreach (self::MODULES as $module) {
            if (str_starts_with($action, $module)) {
                return $module;
            }
        }

        return null;
    }

    /**
     * 判断 action 是否需要写权限
     *
     * 约定：`*List` / `*Detail` 以及 `profile` 为只读，其余一律视为写操作
     * （宁可多拦一次，也不让只读角色误触发写接口）。
     *
     * @param string $action 方法名
     * @return string `read` 或 `write`
     */
    public static function actionType(string $action): string
    {
        $action = strtolower($action);
        foreach (['list', 'detail', 'profile'] as $readSuffix) {
            if (str_ends_with($action, $readSuffix)) {
                return self::READ;
            }
        }

        return self::WRITE;
    }
}
