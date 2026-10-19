<?php
declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;

/**
 * 跨域中间件（生产收紧版）
 *
 * 策略：
 * - 白名单来自环境变量 `CORS_ALLOW_ORIGINS`（逗号分隔）；未配置时回落到本地开发地址；
 * - **命中白名单**：回显该 `Origin` 并允许携带凭据；
 * - **未命中**：不下发任何 CORS 头（浏览器按同源策略拦截），不再回退 `*`；
 * - 无 `Origin` 头（同域请求 / 服务端调用）：直接放行，不附加 CORS 头。
 *
 * 说明：同域部署（Nginx 反代 `/api`）本身不需要 CORS，白名单只为本地联调与
 * 独立前端域保留；不要再使用通配来源，否则任何站点都能读取接口响应。
 */
class Cors
{
    /**
     * 默认允许来源（仅本地开发）
     * @var string[]
     */
    protected array $defaultOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ];

    /**
     * 中间件入口
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $origin      = trim((string) $request->header('origin', ''));
        $allowOrigin = $this->resolveOrigin($origin);

        // 预检：命中白名单才回 CORS 头，未命中也返回 204（由浏览器拦截）
        if ($request->method(true) === 'OPTIONS') {
            return $this->withHeaders(response('', 204), $allowOrigin);
        }

        return $this->withHeaders($next($request), $allowOrigin);
    }

    /**
     * 解析实际允许的来源
     * @param string $origin 请求携带的 Origin（可能为空）
     * @return string|null 命中返回来源；无 Origin 或未命中返回 null（不下发 CORS 头）
     */
    protected function resolveOrigin(string $origin): ?string
    {
        if ($origin === '') {
            return null;
        }

        return in_array($origin, $this->allowOrigins(), true) ? $origin : null;
    }

    /**
     * 允许来源白名单（环境变量优先）
     * @return string[]
     */
    protected function allowOrigins(): array
    {
        $raw = trim((string) env('CORS_ALLOW_ORIGINS', ''));

        if ($raw === '') {
            return $this->defaultOrigins;
        }

        $list = array_map('trim', explode(',', $raw));

        return array_values(array_filter($list, static fn (string $item): bool => $item !== ''));
    }

    /**
     * 附加 CORS 响应头（未命中白名单时不附加任何 CORS 头）
     * @param Response    $response
     * @param string|null $allowOrigin
     * @return Response
     */
    protected function withHeaders(Response $response, ?string $allowOrigin): Response
    {
        if ($allowOrigin === null) {
            return $response;
        }

        return $response->header([
            'Access-Control-Allow-Origin'      => $allowOrigin,
            'Access-Control-Allow-Methods'     => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers'     => 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Max-Age'           => '86400',
            'Access-Control-Allow-Credentials' => 'true',
            'Vary'                             => 'Origin',
        ]);
    }
}
