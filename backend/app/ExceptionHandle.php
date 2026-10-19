<?php
declare(strict_types=1);

namespace app;

use think\db\exception\DataNotFoundException;
use think\db\exception\ModelNotFoundException;
use think\exception\Handle;
use think\exception\HttpException;
use think\exception\HttpResponseException;
use think\exception\ValidateException;
use think\Response;
use Throwable;

/**
 * 应用异常处理类
 *
 * 本项目为纯 API 服务，统一将异常转换为 { code, message, data } 响应：
 * - ValidateException → 1001
 * - HttpException 404 → 4004
 * - 其他异常          → 5000
 */
class ExceptionHandle extends Handle
{
    /**
     * 不需要记录信息（日志）的异常类列表
     * @var array
     */
    protected $ignoreReport = [
        HttpException::class,
        HttpResponseException::class,
        ModelNotFoundException::class,
        DataNotFoundException::class,
        ValidateException::class,
    ];

    /**
     * 记录异常信息（日志）
     * @param Throwable $exception
     * @return void
     */
    public function report(Throwable $exception): void
    {
        parent::report($exception);
    }

    /**
     * Render an exception into an HTTP response.
     * @param \think\Request $request
     * @param Throwable      $e
     * @return Response
     */
    public function render($request, Throwable $e): Response
    {
        // 路由未命中/中间件提前返回的 Response，直接透传
        if ($e instanceof HttpResponseException) {
            return $e->getResponse();
        }

        // 参数校验异常 → 1001（message 为可直接展示的中文提示）
        if ($e instanceof ValidateException) {
            return fail(error_code()['VALIDATE_FAIL'], $e->getError());
        }

        // HTTP 异常（含 404）
        if ($e instanceof HttpException) {
            if ($e->getStatusCode() === 404) {
                // 关键安全约束：未命中路由统一返回**真正的 HTTP 404 状态码**，
                // 且响应体仍为合法 JSON（{code:4004,...}）。全站 404 形态一致，
                // 攻击者无法通过状态码差异探测后台前缀（CMS_PATH）是否启用。
                // 前端 request() 只解析 JSON 体、不检查 response.ok，故不造成回归。
                return json([
                    'code'    => error_code()['NOT_FOUND'],
                    'message' => '请求的资源不存在',
                    'data'    => null,
                ], 404);
            }
            return fail(error_code()['SERVER_ERROR'], $e->getMessage() ?: '请求异常');
        }

        // 其他异常统一兜底：调试期回显原因，生产期返回通用提示（不回显堆栈）
        $message = $this->app->isDebug()
            ? $e->getMessage()
            : '服务器开小差了，请稍后重试';

        return fail(error_code()['SERVER_ERROR'], $message);
    }
}
