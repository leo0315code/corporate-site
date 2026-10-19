<?php
declare(strict_types=1);

namespace app\controller;

use app\BaseController;
use think\Response;

/**
 * 默认控制器：仅提供健康检查，便于部署自检
 */
class Index extends BaseController
{
    /**
     * 健康检查
     * @return Response
     */
    public function index(): Response
    {
        return success([
            'service' => 'corporate-site-api',
            'status'  => 'running',
        ]);
    }
}
