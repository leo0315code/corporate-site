<?php
declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;

/**
 * 公共读接口缓存头中间件（ContentCache）
 *
 * 为匿名只读的内容 GET 接口统一追加 `Cache-Control: public, max-age=60`
 * （架构 6.3：内容读接口短 TTL，配合前端内存缓存实现「刷新即生效」）。
 *
 * 仅由路由分组挂载（不全局注册），故不影响到写接口与后台接口。
 */
class ContentCache
{
    /** 缓存有效期（秒），对齐前端内容缓存 TTL 60s */
    protected int $maxAge = 60;

    /**
     * 中间件入口
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        return $response->header([
            'Cache-Control' => 'public, max-age=' . $this->maxAge,
        ]);
    }
}
