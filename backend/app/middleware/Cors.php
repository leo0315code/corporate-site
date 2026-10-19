<?php
declare(strict_types=1);

namespace app\middleware;

use Closure;
use think\Request;
use think\Response;

/**
 * 跨域中间件（开发期双保险）
 *
 * 开发期前端运行在 5173、后端在 8000，首选方案是 Vite proxy（无跨域）；
 * 本中间件作为备用方案，放行常见本地来源并处理 OPTIONS 预检。
 */
class Cors
{
    /**
     * 允许的来源（开发期本地调试地址）
     * @var string[]
     */
    protected array $allowOrigins = [
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
        $origin = $request->header('origin', '');
        $allowOrigin = $this->resolveOrigin($origin);

        // 预检请求直接返回 204
        if ($request->method(true) === 'OPTIONS') {
            return $this->withHeaders(response('', 204), $allowOrigin);
        }

        $response = $next($request);

        return $this->withHeaders($response, $allowOrigin);
    }

    /**
     * 解析实际允许的来源：命中白名单则回显具体来源，否则回退为通配 '*'
     * @param string $origin 请求携带的 Origin
     * @return string
     */
    protected function resolveOrigin(string $origin): string
    {
        if ($origin !== '' && in_array($origin, $this->allowOrigins, true)) {
            return $origin;
        }
        // 未命中白名单时放行全部（开发期便利；生产建议收紧）
        return '*';
    }

    /**
     * 附加 CORS 响应头
     * 注意：当来源回退为通配 '*' 时不发送 Allow-Credentials，
     * 避免浏览器拒绝「通配来源 + 携带凭据」的组合。
     * @param Response $response
     * @param string   $allowOrigin
     * @return Response
     */
    protected function withHeaders(Response $response, string $allowOrigin): Response
    {
        $headers = [
            'Access-Control-Allow-Origin'  => $allowOrigin,
            'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Max-Age'       => '86400',
        ];

        if ($allowOrigin !== '*') {
            $headers['Access-Control-Allow-Credentials'] = 'true';
        }

        return $response->header($headers);
    }
}
