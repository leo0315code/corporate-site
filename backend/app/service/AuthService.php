<?php
declare(strict_types=1);

namespace app\service;

use app\model\AdminSession;
use app\model\AdminUser;
use app\model\LoginAttempt;
use app\validate\AuthValidate;
use think\facade\Log;
use think\Response;

/**
 * 认证业务服务
 *
 * 职责：
 * - `login`         ：登录编排（双维度锁定判定 → 密码校验 → 清零/累计 → 签发 Token）；
 * - `logout`        ：作废当前 Token；
 * - `profile`       ：返回当前管理员资料（永不含密码/哈希）；
 * - `changePassword`：常规改密（校验原密码，成功后作废该账号全部会话）；
 * - `resetPassword` ：首次强制改密（仅 must_change_password=1 时允许）。
 *
 * 安全要点（PRD 6.1–6.4）：
 * - 密码一律 `password_hash(PASSWORD_BCRYPT)` / `password_verify()`，禁止自定义加密；
 * - 账号不存在与密码错误统一返回 1004（防枚举）；
 * - 锁定期内即使密码正确也拒绝（判定在密码校验之前完成）；
 * - 任何响应/日志**不输出**密码或哈希。
 */
class AuthService
{
    /** 统一登录失败文案（不区分账号不存在 / 密码错误，防枚举） */
    protected const LOGIN_FAIL_MSG = '账号或密码错误';

    /**
     * 登录
     *
     * 判定顺序严格遵循 PRD 6.2：
     *   1. IP 维度锁定 → 2. 账号维度锁定 → 3. 校验账号密码（失败统一 1004 并累计双维度）
     *   → 4. 成功则双维度清零、签发 Token、更新登录痕迹。
     *
     * @param string $username 登录账号
     * @param string $password 明文密码
     * @param string $ip       请求 IP
     * @param string $ua       请求 UA
     * @return Response 统一响应结构
     */
    public function login(string $username, string $password, string $ip, string $ua): Response
    {
        // —— 参数校验（服务端最终裁决）——
        $validate = new AuthValidate();
        if (!$validate->scene('login')->check(['username' => $username, 'password' => $password])) {
            OpLogService::record(
                'auth',
                'login',
                0,
                '登录失败：参数不合法',
                $username,
                $username,
                OpLogContext::forLoginAttempt($username, $ip, $ua)
            );
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        try {
            // 1) IP 维度锁定
            $ipLock = LoginAttempt::lockedSeconds(LoginAttempt::SCOPE_IP, $ip);
            if ($ipLock > 0) {
                OpLogService::record(
                    'auth',
                    'login',
                    0,
                    '登录失败：账号或 IP 已锁定',
                    $username,
                    $username,
                    OpLogContext::forLoginAttempt($username, $ip, $ua)
                );
                return $this->lockedResponse($ipLock);
            }

            // 2) 账号维度锁定（即便账号不存在，也对「账号名」维度计数，避免探测存在性）
            $accountLock = LoginAttempt::lockedSeconds(LoginAttempt::SCOPE_ACCOUNT, $username);
            if ($accountLock > 0) {
                OpLogService::record(
                    'auth',
                    'login',
                    0,
                    '登录失败：账号已锁定',
                    $username,
                    $username,
                    OpLogContext::forLoginAttempt($username, $ip, $ua)
                );
                return $this->lockedResponse($accountLock);
            }

            // 3) 校验账号与密码
            //    计时侧信道防护（CWE-208）：无论账号是否存在，都**恰好执行一次** bcrypt 校验。
            //    账号存在 → 校验真实哈希；账号不存在 → 对固定哑元哈希做一次等价校验并丢弃结果，
            //    使两路分支耗时一致，避免通过响应时间差枚举有效账号（响应体已统一 1004）。
            $admin = AdminUser::findActiveByUsername($username);
            if ($admin instanceof AdminUser) {
                $ok = $admin->verifyPassword($password);
            } else {
                AdminUser::verifyDummy($password);
                $ok = false;
            }

            if (!$ok) {
                // 3.1 失败：双维度累计失败次数（达到阈值自动写入 locked_until）
                $ipCount      = LoginAttempt::recordFail(LoginAttempt::SCOPE_IP, $ip);
                $accountCount = LoginAttempt::recordFail(LoginAttempt::SCOPE_ACCOUNT, $username);

                // 审计日志：仅记录维度与计数，绝不记录密码
                Log::info(sprintf(
                    '[cms:login] 登录失败 ip=%s account=%s ip_fail=%d account_fail=%d',
                    $ip,
                    $username,
                    $ipCount,
                    $accountCount
                ));

                // 操作日志：统一文案（不区分账号/密码），admin_id=0，账号名取提交值（已清洗）
                OpLogService::record(
                    'auth',
                    'login',
                    0,
                    '登录失败：账号或密码错误',
                    $username,
                    $username,
                    OpLogContext::forLoginAttempt($username, $ip, $ua)
                );

                // 3.2 若本次失败刚好触发锁定，直接返回 1005（含剩余分钟），否则返回 1004
                $remain = LoginAttempt::lockedSeconds(LoginAttempt::SCOPE_ACCOUNT, $username);
                if ($remain <= 0) {
                    $remain = LoginAttempt::lockedSeconds(LoginAttempt::SCOPE_IP, $ip);
                }
                if ($remain > 0) {
                    return $this->lockedResponse($remain);
                }

                return fail(error_code()['LOGIN_FAILED'], self::LOGIN_FAIL_MSG);
            }

            // 4) 成功：双维度清零 → 签发 Token → 更新登录痕迹
            LoginAttempt::reset(LoginAttempt::SCOPE_IP, $ip);
            LoginAttempt::reset(LoginAttempt::SCOPE_ACCOUNT, $username);

            $session = AdminSession::issue((int) $admin->id, $ip, $ua);
            $admin->markLogin($ip);

            Log::info(sprintf('[cms:login] 登录成功 ip=%s account=%s admin_id=%d', $ip, $username, $admin->id));

            // 操作日志：登录成功（自建 ctx，登录处无 admin 注入）
            OpLogService::record(
                'auth',
                'login',
                1,
                '登录成功',
                $username,
                $username,
                new OpLogContext((int) $admin->id, (string) $admin->username, $ip, mb_substr($ua, 0, 255))
            );

            return success([
                'token'                => (string) $session->token,
                'expires_at'           => (string) $session->expires_at,
                'expires_in'           => AdminSession::TTL_SECONDS,
                'must_change_password' => (int) $admin->must_change_password === 1,
                'profile'              => $admin->toProfile(),
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:login] 登录异常：' . $e->getMessage());
            OpLogService::record(
                'auth',
                'login',
                0,
                '登录异常',
                $username,
                $username,
                OpLogContext::forLoginAttempt($username, $ip, $ua)
            );
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 登出：作废当前 Token
     * @param string            $token 当前会话 Token
     * @param OpLogContext|null $ctx   操作日志上下文
     * @return Response 统一响应结构
     */
    public function logout(string $token, ?OpLogContext $ctx = null): Response
    {
        try {
            AdminSession::revoke($token);

            OpLogService::record(
                'auth',
                'logout',
                1,
                '登出',
                $ctx?->adminName ?? '',
                $ctx?->adminName ?? '',
                $ctx
            );

            return success();
        } catch (\Throwable $e) {
            Log::error('[cms:logout] 登出异常：' . $e->getMessage());
            OpLogService::record('auth', 'logout', 0, '登出异常', $ctx?->adminName ?? '', $ctx?->adminName ?? '', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 当前管理员资料（永不含密码/哈希）
     * @param AdminUser $admin 当前登录管理员
     * @return Response 统一响应结构
     */
    public function profile(AdminUser $admin): Response
    {
        return success($admin->toProfile());
    }

    /**
     * 常规修改密码
     *
     * 校验：原密码正确（否则 1007）→ 新密码强度（否则 1001）→ 不与旧密码相同（否则 1001）。
     * 成功：更新哈希、解除强制改密、**作废该账号全部会话**（前端需重新登录）。
     *
     * @param AdminUser         $admin       当前登录管理员
     * @param string            $oldPassword 原密码
     * @param string            $newPassword 新密码
     * @param string            $confirm     确认新密码
     * @param OpLogContext|null $ctx         操作日志上下文（尾参；由 `AdminAuth` 注入的 ctx 提供真实 ip/ua）
     * @return Response 统一响应结构
     */
    public function changePassword(AdminUser $admin, string $oldPassword, string $newPassword, string $confirm, ?OpLogContext $ctx = null): Response
    {
        $username = (string) $admin->username;

        // 操作日志上下文：优先用调用方透传的 ctx（含真实 ip/ua）；
        // 未传（如 CLI / 漏传路径）时回退 contextOf()，保证「永不阻断主流程」。
        $ctx = $ctx ?? $this->contextOf($admin);

        $validate = new AuthValidate();
        if (!$validate->scene('changePassword')->check([
            'old_password'     => $oldPassword,
            'new_password'     => $newPassword,
            'confirm_password' => $confirm,
        ])) {
            OpLogService::record('auth', 'change_password', 0, '修改密码失败：' . $validate->getError(), $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        // 1) 原密码校验
        if (!$admin->verifyPassword($oldPassword)) {
            OpLogService::record('auth', 'change_password', 0, '修改密码失败：原密码错误', $username, $username, $ctx);
            return fail(error_code()['OLD_PWD_WRONG'], '原密码错误');
        }

        // 2) 新密码强度
        $strength = $this->checkStrength($newPassword, $username);
        if ($strength !== '') {
            OpLogService::record('auth', 'change_password', 0, '修改密码失败：' . $strength, $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $strength);
        }

        // 3) 不得与原密码相同
        if (hash_equals($oldPassword, $newPassword)) {
            OpLogService::record('auth', 'change_password', 0, '修改密码失败：新密码不得与原密码相同', $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], '新密码不得与原密码相同');
        }

        try {
            $admin->changePassword($newPassword);
            // 改密成功后强制所有端重新登录
            AdminSession::revokeAll((int) $admin->id);

            Log::info(sprintf('[cms:password] 修改密码成功 admin_id=%d', $admin->id));

            OpLogService::record('auth', 'change_password', 1, '修改本人密码成功', $username, $username, $ctx);

            return success();
        } catch (\Throwable $e) {
            Log::error('[cms:password] 修改密码异常：' . $e->getMessage());
            OpLogService::record('auth', 'change_password', 0, '修改密码失败：系统异常', $username, $username, $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 首次强制改密
     *
     * 仅当 `must_change_password = 1` 时允许（否则 1001）；其余规则同 `changePassword`。
     * 本接口在 AdminAuth 白名单内，故未改密时也能访问。
     *
     * @param AdminUser         $admin       当前登录管理员
     * @param string            $newPassword 新密码
     * @param string            $confirm     确认新密码
     * @param OpLogContext|null $ctx         操作日志上下文（尾参；由 `AdminAuth` 注入的 ctx 提供真实 ip/ua）
     * @return Response 统一响应结构
     */
    public function resetPassword(AdminUser $admin, string $newPassword, string $confirm, ?OpLogContext $ctx = null): Response
    {
        $username = (string) $admin->username;

        // 操作日志上下文：优先用调用方透传的 ctx（含真实 ip/ua）；未传时回退 contextOf()
        $ctx = $ctx ?? $this->contextOf($admin);

        if ((int) $admin->must_change_password !== 1) {
            OpLogService::record('auth', 'change_password', 0, '强制改密失败：当前账号无需强制修改初始密码', $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], '当前账号无需强制修改初始密码');
        }

        $validate = new AuthValidate();
        if (!$validate->scene('resetPassword')->check([
            'new_password'     => $newPassword,
            'confirm_password' => $confirm,
        ])) {
            OpLogService::record('auth', 'change_password', 0, '强制改密失败：' . $validate->getError(), $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        $strength = $this->checkStrength($newPassword, $username);
        if ($strength !== '') {
            OpLogService::record('auth', 'change_password', 0, '强制改密失败：' . $strength, $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $strength);
        }

        try {
            $admin->changePassword($newPassword);
            AdminSession::revokeAll((int) $admin->id);

            Log::info(sprintf('[cms:password] 强制改密完成 admin_id=%d', $admin->id));

            OpLogService::record('auth', 'change_password', 1, '首次强制改密成功', $username, $username, $ctx);

            return success();
        } catch (\Throwable $e) {
            Log::error('[cms:password] 强制改密异常：' . $e->getMessage());
            OpLogService::record('auth', 'change_password', 0, '强制改密失败：系统异常', $username, $username, $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 由当前管理员构造操作日志上下文（**CLI / 未传 ctx 时的兜底**）
     *
     * 说明：`changePassword` / `resetPassword` 已新增尾参 `?OpLogContext $ctx`，
     * 正常 HTTP 路径由 Controller 透传 `AdminAuth` 注入的 ctx（**含真实 ip/ua**）；
     * 本方法仅在调用方未传 ctx（如 CLI 脚本）时兜底，此时 `ip/ua` 为空。
     * 保留兜底可保证任何漏传路径也不会抛异常，符合「日志永不阻断主流程」。
     *
     * @param AdminUser $admin 当前登录管理员
     * @return OpLogContext
     */
    protected function contextOf(AdminUser $admin): OpLogContext
    {
        return new OpLogContext(
            (int) $admin->id,
            (string) $admin->username,
            '',
            ''
        );
    }

    /**
     * 根据剩余秒数构造 1005 锁定响应（message 含剩余分钟）
     * @param int $remainSeconds 剩余锁定秒数（> 0）
     * @return Response
     */
    protected function lockedResponse(int $remainSeconds): Response
    {
        $minutes = (int) ceil($remainSeconds / 60);
        if ($minutes < 1) {
            $minutes = 1;
        }

        return fail(error_code()['ACCOUNT_LOCKED'], sprintf('登录失败次数过多，请 %d 分钟后再试', $minutes));
    }

    /**
     * 新密码强度校验
     *
     * 规则（PRD 6.6）：长度 ≥ 8，且**同时**包含字母与数字，且不得与账号名相同。
     * （长度/一致性已由 AuthValidate 覆盖，此处仅裁决「字母+数字」与「非账号名」。）
     *
     * @param string $password 新密码
     * @param string $username 账号名（用于禁止与账号名相同）
     * @return string 符合返回空串；不符合返回可直接展示的中文提示
     */
    protected function checkStrength(string $password, string $username): string
    {
        if (mb_strlen($password) < 8) {
            return '新密码长度不得少于 8 位';
        }

        $hasLetter = preg_match('/[A-Za-z]/', $password) === 1;
        $hasDigit  = preg_match('/\d/', $password) === 1;
        if (!$hasLetter || !$hasDigit) {
            return '新密码需同时包含字母和数字';
        }

        if ($username !== '' && strcasecmp($password, $username) === 0) {
            return '新密码不得与账号名相同';
        }

        return '';
    }
}
