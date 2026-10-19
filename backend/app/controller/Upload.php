<?php
declare(strict_types=1);

namespace app\controller;

use app\service\OpLogContext;
use app\service\UploadService;
use think\Request;
use think\Response;

/**
 * 图片上传控制器（后台，路由挂载在 AdminAuth 之内 → **必须登录**）
 *
 * action 命名（**必须与 route/app.php 注册一致**）：
 * | action | 方法 | 路由（{P} = CMS_PATH）        |
 * | ------ | ---- | ----------------------------- |
 * | image  | POST | {P}/api/upload/image          |
 *
 * 请求形态：`multipart/form-data`
 * - `file`  上传文件（必填）
 * - `type`  业务分组（product|news|case|common，默认 common）
 *
 * 响应：统一结构；成功时 data = { url, path, size, mime, name }。
 * 业务编排全部交由 `UploadService`，本控制器只做参数读取。
 */
class Upload
{
    /**
     * 上传业务服务
     * @var UploadService
     */
    protected UploadService $service;

    /**
     * 依赖注入业务服务
     * @param UploadService $service
     */
    public function __construct(UploadService $service)
    {
        $this->service = $service;
    }

    /**
     * 图片上传
     *
     * @param Request $request
     * @return Response
     */
    public function image(Request $request): Response
    {
        $type = (string) $request->param('type', 'common');

        /** @var \think\file\UploadedFile|null $file */
        $file = $request->file(UploadService::FIELD);

        $ctx = $request->opLogContext;

        return $this->service->image($file, $type, $ctx instanceof OpLogContext ? $ctx : null);
    }
}
