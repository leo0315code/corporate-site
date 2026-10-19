<?php
declare(strict_types=1);

namespace app\controller;

use app\model\AdminUser;
use app\service\AuthService;
use app\service\OpLogContext;
use think\Request;
use think\Response;

/**
 * 后台认证控制器
 *
 * action 命名（**必须与 `AdminAuth::$pwdWhitelist` / C06 路由注册保持一致**）：
 * - login()          → POST {CMS_PATH}/api/auth/login            登录（无需 AdminAuth，挂 LoginThrottle）
 * - logout()         → POST {CMS_PATH}/api/auth/logout           登出（AdminAuth）
 * - profile()        → GET  {CMS_PATH}/api/auth/profile          当前管理员资料（AdminAuth）
 * - changePassword() → POST {CMS_PATH}/api/auth/change-password  常规改密（AdminAuth）
 * - resetPassword()  → POST {CMS_PATH}/api/auth/reset-password   首次强制改密（AdminAuth 白名单放行）
 *
 * 白名单匹配形式：`strtolower(controller . '/' . action)`，因此本控制器对应
 * `auth/login`、`auth/logout`、`auth/profile`、`auth/changepassword`、`auth/resetpassword`。
 *
 * 安全：响应**不含**密码/哈希；日志不记录明文密码。
 */
class Auth
{
    /**
     * 认证业务服务
     * @var AuthService
     */
    protected AuthService $service;

    /**
     * 依赖注入业务服务
     * @param AuthService $service
     */
    public function __construct(AuthService $service)
    {
        $this->service = $service;
    }

    /**
     * 登录（POST {CMS_PATH}/api/auth/login）
     * @param Request $request
     * @return Response
     */
    public function login(Request $request): Response
    {
        $payload  = $this->payload($request);
        $username = trim((string) ($payload['username'] ?? ''));
        // 密码不 trim（保持原样），仅做类型转换
        $password = (string) ($payload['password'] ?? '');

        return $this->service->login($username, $password, $request->ip(), $this->userAgent($request));
    }

    /**
     * 登出（POST {CMS_PATH}/api/auth/logout）
     * @param Request $request
     * @return Response
     */
    public function logout(Request $request): Response
    {
        $ctx = $request->opLogContext;

        return $this->service->logout((string) $request->adminToken, $ctx instanceof OpLogContext ? $ctx : null);
    }

    /**
     * 当前管理员资料（GET {CMS_PATH}/api/auth/profile）
     * @param Request $request
     * @return Response
     */
    public function profile(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        return $this->service->profile($admin);
    }

    /**
     * 常规修改密码（POST {CMS_PATH}/api/auth/change-password）
     * @param Request $request
     * @return Response
     */
    public function changePassword(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        $payload = $this->payload($request);

        return $this->service->changePassword(
            $admin,
            $this->pick($payload, ['oldPassword', 'old_password']),
            $this->pick($payload, ['newPassword', 'new_password']),
            $this->pick($payload, ['confirmPassword', 'confirm_password']),
            $this->logContext($request)
        );
    }

    /**
     * 首次强制改密（POST {CMS_PATH}/api/auth/reset-password）
     * @param Request $request
     * @return Response
     */
    public function resetPassword(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        $payload = $this->payload($request);

        return $this->service->resetPassword(
            $admin,
            $this->pick($payload, ['newPassword', 'new_password']),
            $this->pick($payload, ['confirmPassword', 'confirm_password']),
            $this->logContext($request)
        );
    }

    /**
     * 读取请求体（兼容 JSON 与表单）
     * @param Request $request
     * @return array<string, mixed>
     */
    protected function payload(Request $request): array
    {
        $payload = $request->post();
        if (empty($payload)) {
            $payload = $request->param();
        }

        return is_array($payload) ? $payload : [];
    }

    /**
     * 从载荷中按候选键取首个非空字符串（兼容 camelCase 与 snake_case）
     * @param array<string, mixed> $payload 载荷
     * @param string[]             $keys    候选键（按优先级）
     * @return string
     */
    protected function pick(array $payload, array $keys): string
    {
        foreach ($keys as $key) {
            if (isset($payload[$key]) && $payload[$key] !== '') {
                return (string) $payload[$key];
            }
        }

        return '';
    }

    /**
     * 取当前登录管理员（中间件注入 `$request->admin`）
     * @param Request $request
     * @return AdminUser|null
     */
    protected function currentAdmin(Request $request): ?AdminUser
    {
        $admin = $request->admin;

        return $admin instanceof AdminUser ? $admin : null;
    }

    /**
     * 读取操作日志上下文（中间件注入 `$request->opLogContext`）
     *
     * 说明：`AdminAuth` 放行前已注入 `fromRequest()`（含真实 ip/ua）；此处仅做类型收敛，
     * 极端情况下（未经过中间件）兜底为 `OpLogContext::system()`，保证必不为 null。
     *
     * @param Request $request
     * @return OpLogContext
     */
    protected function logContext(Request $request): OpLogContext
    {
        $ctx = $request->opLogContext;

        return $ctx instanceof OpLogContext ? $ctx : OpLogContext::system();
    }

    /**
     * 取请求 UA（截断存储）
     * @param Request $request
     * @return string
     */
    protected function userAgent(Request $request): string
    {
        return mb_substr((string) $request->header('user-agent', ''), 0, 255);
    }
}
