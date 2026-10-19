<?php
declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\facade\Cache;
use think\Request;
use think\Response;

/**
 * 登录接口限流中间件（LoginThrottle）
 *
 * 规则：同一 IP 对登录接口的请求频率限制（默认 1 分钟 ≤ 10 次）；
 * 超限直接返回 1008，不进入后续账号/密码校验逻辑。
 *
 * 实现：TP `Cache`（file 驱动），key = `login:rate:<ip>`，TTL 60s。
 * 说明：定位为「防爆破第一道闸」，配合 `login_attempt` 双维度锁定构成纵深防御。
 */
class LoginThrottle
{
    /** 时间窗口（秒） */
    protected int $window = 60;

    /**
     * 中间件入口
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $ip  = $request->ip();
        $key = 'login:rate:' . $ip;

        /** @var array{count:int,start:int}|null $bucket */
        $bucket = Cache::get($key);

        $now = time();

        if (!is_array($bucket) || ($now - (int) ($bucket['start'] ?? 0)) >= $this->window) {
            // 新窗口：从 1 开始计数
            Cache::set($key, ['count' => 1, 'start' => $now], $this->window);
        } else {
            $bucket['count'] = (int) $bucket['count'] + 1;
            // 保留原窗口起点，避免计数被无限延长
            Cache::set($key, $bucket, $this->window);

            if ($bucket['count'] > $this->maxAttempts()) {
                return fail(error_code()['TOO_MANY_REQ'], '请求过于频繁，请稍后再试');
            }
        }

        return $next($request);
    }

    /**
     * 读取限流阈值（来自 config/cms.php，默认 10）
     * @return int
     */
    protected function maxAttempts(): int
    {
        $limit = (int) config('cms.rate_limit', 10);

        return $limit > 0 ? $limit : 10;
    }
}
