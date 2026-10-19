<?php
declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\facade\Cache;
use think\facade\Log;
use think\Request;
use think\Response;

/**
 * 留言提交限流中间件（MessageThrottle）
 *
 * 背景：`POST /api/message` 为匿名接口，原有防护只有「同 IP + 同内容 60s 幂等」，
 * 换一段内容即可无限提交 → 可被脚本灌库。本中间件补齐**IP 维度滑动窗口限流**，
 * 与 `LoginThrottle` 同构（TP Cache 固定窗口），构成留言侧第一道闸。
 *
 * 规则：同 IP 在 `cms.message_rate_window` 秒内最多 `cms.message_rate_max` 次，
 * 超限返回 `1008`（HTTP 429），不进入校验与落库逻辑。
 *
 * 挂载：仅 `Route::post('message', ...)` 单条路由，不影响其它接口。
 */
class MessageThrottle
{
    /**
     * 中间件入口
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $ip   = $request->ip();
        $key  = 'message:rate:' . ($ip !== '' ? $ip : 'unknown');
        $now  = time();
        $ttl  = $this->window();

        /** @var array{count:int,start:int}|null $bucket */
        $bucket = Cache::get($key);

        if (!is_array($bucket) || ($now - (int) ($bucket['start'] ?? 0)) >= $ttl) {
            // 新窗口
            $bucket = ['count' => 1, 'start' => $now];
        } else {
            $bucket['count'] = (int) $bucket['count'] + 1;
        }

        // 始终以原窗口起点续期，避免被连续请求无限延长窗口
        Cache::set($key, $bucket, $ttl);

        if ($bucket['count'] > $this->max()) {
            Log::warning(sprintf(
                '[message] 提交过于频繁 ip=%s count=%d window=%ds',
                $ip,
                $bucket['count'],
                $ttl
            ));

            return fail(error_code()['TOO_MANY_REQ'], '提交过于频繁，请稍后再试');
        }

        return $next($request);
    }

    /**
     * 时间窗口（秒）：默认 600（10 分钟）
     * @return int
     */
    protected function window(): int
    {
        $window = (int) config('cms.message_rate_window', 600);

        return $window > 0 ? $window : 600;
    }

    /**
     * 窗口内最大提交次数：默认 5
     * @return int
     */
    protected function max(): int
    {
        $max = (int) config('cms.message_rate_max', 5);

        return $max > 0 ? $max : 5;
    }
}
