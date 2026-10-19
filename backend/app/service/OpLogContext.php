<?php
declare(strict_types=1);

namespace app\service;

use app\model\AdminUser;
use think\Request;

/**
 * 操作日志上下文（不可变值对象）：在鉴权边界一次性采集。
 *
 * 职责：承载「当前操作人 + 请求来源（ip / ua）」三类信息，经 Controller 显式透传给 Service，
 * 使 Service **无需依赖 HTTP `request()`**（CLI 安全、可测试）。
 *
 * 背景（见 ARCHITECTURE-CMS-OPLOG.md 难点 1）：Service 层原有方法拿不到「操作人」，
 * 采用「鉴权边界构造值对象 + 显式透传」而非隐式全局容器，避免常驻运行时下的跨请求串号。
 */
final class OpLogContext
{
    /**
     * @param int    $adminId   操作人 ID（0=未识别，如登录失败账号不存在）
     * @param string $adminName 操作人账号名快照
     * @param string $ip        来源 IP
     * @param string $userAgent 请求 UA（截断 255）
     */
    public function __construct(
        public readonly int $adminId,
        public readonly string $adminName,
        public readonly string $ip,
        public readonly string $userAgent,
    ) {
    }

    /**
     * 从 HTTP 请求采集（`AdminAuth` 放行前调用；`admin` 由中间件注入）
     *
     * 注意：必须在中间件写入 `$request->admin` **之后**调用，否则取不到真实操作人。
     *
     * @param Request $request
     * @return self
     */
    public static function fromRequest(Request $request): self
    {
        $admin = $request->admin instanceof AdminUser ? $request->admin : null;

        return new self(
            $admin ? (int) $admin->id : 0,
            $admin ? (string) $admin->username : '',
            (string) $request->ip(),
            mb_substr((string) $request->header('user-agent', ''), 0, 255),
        );
    }

    /**
     * CLI / 无上下文兜底
     * @return self
     */
    public static function system(): self
    {
        return new self(0, 'system', '0.0.0.0', '');
    }

    /**
     * 由「尝试账号名」构造（登录失败专用；account 来自请求，须清洗截断）
     *
     * 安全：`admin_id` 固定为 0；`admin_name` 取**提交值**（账号不存在时无法取到真实名），
     * 该值来自攻击者输入，必须 `trim` → 去控制字符 → `mb_substr(…, 0, 50)`。
     *
     * @param string $username 提交的账号名
     * @param string $ip       来源 IP
     * @param string $ua       请求 UA
     * @return self
     */
    public static function forLoginAttempt(string $username, string $ip, string $ua): self
    {
        $clean = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $username) ?? ''), 0, 50);

        return new self(0, $clean, mb_substr($ip, 0, 45), mb_substr($ua, 0, 255));
    }
}
