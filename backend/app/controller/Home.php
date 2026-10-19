<?php
declare(strict_types=1);

namespace app\controller;

use app\service\HomeService;
use think\Request;
use think\Response;

/**
 * 首页聚合控制器（匿名只读）
 *
 * action：
 * | action  | 方法 | 路由             | 参数 |
 * | ------- | ---- | ---------------- | ---- |
 * | summary | GET  | /api/home/summary | productLimit,newsLimit |
 *
 * 业务编排全部委托 `HomeService`。
 */
class Home
{
    /**
     * 首页聚合服务
     * @var HomeService
     */
    protected HomeService $service;

    /**
     * 依赖注入业务服务
     * @param HomeService $service
     */
    public function __construct(HomeService $service)
    {
        $this->service = $service;
    }

    /**
     * 首页聚合数据
     * @param Request $request
     * @return Response
     */
    public function summary(Request $request): Response
    {
        $productLimit = $request->param('productLimit', null);
        $newsLimit    = $request->param('newsLimit', null);

        return $this->service->summary(
            $productLimit === null || $productLimit === '' ? null : (int) $productLimit,
            $newsLimit === null || $newsLimit === '' ? null : (int) $newsLimit
        );
    }
}
