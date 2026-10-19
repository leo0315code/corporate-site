<?php
declare(strict_types=1);

namespace app\middleware;

use app\model\AdminSession;
use app\model\AdminUser;
use app\service\OpLogContext;
use Closure;
use think\Request;
use think\Response;

/**
 * 后台管理 API 鉴权中间件（AdminAuth）
 *
 * 职责：管理 API 的准入闸门——校验会话 Token、加载管理员、按需触发 1003 / 1006。
 *
 * 处理流程（严格顺序）：
 *   1. 解析 `Authorization: Bearer <token>`，缺失/格式错 → 1003；
 *   2. 查 admin_session：token 存在且未过期，否则 → 1003；
 *   3. 查 admin_user：存在且 status=1，否则 → 1003；
 *   4. 强制改密闸门：must_change_password=1 且当前 action 不在白名单 → 1006；
 *   5. 通过：注入 `$request->admin` 与 `$request->adminToken`，放行。
 *
 * 注册方式：**按路由分组挂载**（不在全局中间件注册），避免影响前台公共 API 与登录接口。
 */
class AdminAuth
{
    /**
     * 强制改密闸门白名单：`controller/action`（小写比对）
     *
     * 初始密码未修改时，仅允许这几项，其它管理功能一律 1006。
     * @var array<int, string>
     */
    protected array $pwdWhitelist = [
        'auth/resetpassword', // 强制改初始密码
        'auth/changepassword', // 常规修改密码
        'auth/logout',         // 登出
        'auth/profile',        // 获取当前管理员资料（前端判断跳转所需）
    ];

    /**
     * 中间件入口
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->resolveToken($request);

        // 1) Token 缺失 / 格式错误
        if ($token === '') {
            return fail(error_code()['UNAUTHORIZED'], '请先登录');
        }

        // 2) 会话不存在或已过期
        $session = AdminSession::findValid($token);
        if ($session === null) {
            return fail(error_code()['UNAUTHORIZED'], '登录已过期，请重新登录');
        }

        // 3) 管理员不存在或被禁用
        /** @var AdminUser|null $admin */
        $admin = AdminUser::find((int) $session->admin_id);
        if (!$admin instanceof AdminUser || (int) $admin->status !== 1) {
            // 会话指向的账号已失效，顺手作废该 Token
            AdminSession::revoke($token);
            return fail(error_code()['UNAUTHORIZED'], '登录已过期，请重新登录');
        }

        // 4) 强制改密闸门
        if ((int) $admin->must_change_password === 1 && !$this->isPwdWhitelisted($request)) {
            return fail(error_code()['NEED_RESET_PWD'], '请先修改初始密码');
        }

        // 5) 放行：注入当前管理员与 Token（并采集操作日志上下文）
        $request->admin      = $admin;
        $request->adminToken = $token;
        // 操作日志上下文：必须在 $request->admin 注入**之后**采集（fromRequest 读 $request->admin）
        $request->opLogContext = OpLogContext::fromRequest($request);

        return $next($request);
    }

    /**
     * 从请求头解析 Bearer Token
     * @param Request $request
     * @return string 解析出的 Token；缺失或格式错误返回 ''
     */
    protected function resolveToken(Request $request): string
    {
        $header = (string) $request->header('authorization', '');

        if ($header === '') {
            return '';
        }

        // 兼容大小写与多余空格：Bearer <token>
        if (preg_match('/^Bearer\s+(\S+)$/i', trim($header), $matches) !== 1) {
            return '';
        }

        $token = trim($matches[1]);

        // Token 固定为 64 位十六进制，格式不符直接判为无效
        return preg_match('/^[0-9a-f]{64}$/i', $token) === 1 ? $token : '';
    }

    /**
     * 判断当前请求是否命中强制改密白名单
     * @param Request $request
     * @return bool
     */
    protected function isPwdWhitelisted(Request $request): bool
    {
        $key = strtolower($request->controller() . '/' . $request->action());

        return in_array($key, $this->pwdWhitelist, true);
    }
}
