<?php
declare(strict_types=1);

namespace app\controller;

use app\model\AdminUser;
use app\service\AdminService;
use app\service\OpLogContext;
use think\Request;
use think\Response;

/**
 * 后台账号管理控制器（**整组挂载在 AdminAuth 之内 → 必须登录**）
 *
 * action 命名（**必须与 `route/app.php` 注册保持一致**）：
 * | action         | 方法 | 路由（{P} = CMS_PATH）              |
 * | -------------- | ---- | ----------------------------------- |
 * | adminList      | GET  | {P}/api/admin/list                  |
 * | create         | POST | {P}/api/admin/create                |
 * | toggleStatus   | POST | {P}/api/admin/toggle-status         |
 * | resetPassword  | POST | {P}/api/admin/reset-password        |
 * | delete         | POST | {P}/api/admin/delete                |
 *
 * 说明：
 * - 本控制器 action 名**均不在** `AdminAuth::$pwdWhitelist` 内 → 未改初始密码时访问会被 1006 拦下，
 *   这与「账号管理属于常规管理功能」的定位一致（强制改密优先）；
 * - 所有业务规则（不得操作自己、至少保留 1 个启用账号、账号名二次确认等）由 `AdminService` 裁决；
 *   本控制器只负责读参与「当前登录者」注入；
 * - 请求体统一兼容 JSON 与表单、camelCase 与 snake_case（复用 Auth 控制器的取参风格）；
 * - 响应**永不含**密码哈希；新建 / 重置返回的随机密码**仅在本次响应中出现一次**。
 */
class Admin
{
    /**
     * 账号管理业务服务
     * @var AdminService
     */
    protected AdminService $service;

    /**
     * 依赖注入业务服务
     * @param AdminService $service
     */
    public function __construct(AdminService $service)
    {
        $this->service = $service;
    }

    /**
     * 账号列表（GET {P}/api/admin/list?page=&size=&keyword=）
     * @param Request $request
     * @return Response
     */
    public function adminList(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        return $this->service->list(
            (int) $request->param('page', 1),
            (int) $request->param('size', 10),
            (string) $request->param('keyword', ''),
            $this->logContext($request)
        );
    }

    /**
     * 新建账号（POST {P}/api/admin/create，body: username）
     *
     * 成功返回的 `password` 为服务端生成的随机强密码，**仅此一次返回**。
     * @param Request $request
     * @return Response
     */
    public function create(Request $request): Response
    {
        $payload = $this->payload($request);

        return $this->service->create($this->pick($payload, ['username']), $this->logContext($request));
    }

    /**
     * 启用 / 停用账号（POST {P}/api/admin/toggle-status，body: id + status）
     *
     * 注意：此处**原样透传 `status`**（仅做整数转换，不做 0/1 归一化）。
     * 若在此把非法值（如 5）归一化为 0，则「停用」会在校验器看到之前被静默执行，
     * 使 `AdminValidate` 的 `in:0,1` 形同虚设——畸形请求将变成一次真实的停用操作。
     * 归一化与拒绝统一交由 `AdminService::toggleStatus()`（先校验、后执行）。
     *
     * @param Request $request
     * @return Response
     */
    public function toggleStatus(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        $payload = $this->payload($request);

        return $this->service->toggleStatus(
            (int) ($payload['id'] ?? 0),
            (int) ($payload['status'] ?? -1),
            $this->logContext($request)
        );
    }

    /**
     * 重置他人密码（POST {P}/api/admin/reset-password，body: id）
     *
     * 成功返回的 `password` 为服务端生成的随机强密码，**仅此一次返回**。
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

        return $this->service->resetPassword((int) ($payload['id'] ?? 0), $this->logContext($request));
    }

    /**
     * 删除账号（POST {P}/api/admin/delete，body: id + username）
     *
     * `username` 为二次确认字段，须与目标账号名完全一致。
     * @param Request $request
     * @return Response
     */
    public function delete(Request $request): Response
    {
        $admin = $this->currentAdmin($request);
        if ($admin === null) {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        $payload = $this->payload($request);

        return $this->service->remove(
            (int) ($payload['id'] ?? 0),
            $this->pick($payload, ['username']),
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
     * 说明：5 个方法（含只读的 `list`）统一以 `OpLogContext $ctx` 透传操作人 + 请求来源
     * （ip/ua），与 `ContentService` 等保持一致；`AdminAuth` 放行前已注入 `fromRequest()`，
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
}
