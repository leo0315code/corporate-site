<?php
declare(strict_types=1);

namespace app\controller;

use app\service\MessageService;
use app\service\OpLogContext;
use think\Request;
use think\Response;

/**
 * 留言控制器
 *
 * action 命名（**必须与本文件、C06 路由注册保持一致**）：
 * | action       | 方法 | 路由（{P} = CMS_PATH）           | 鉴权 |
 * | ------------ | ---- | -------------------------------- | ---- |
 * | submit       | POST | /api/message                     | 否（前台匿名） |
 * | adminList    | GET  | {P}/api/message/list             | 是 |
 * | detail       | GET  | {P}/api/message/detail           | 是 |
 * | markStatus   | POST | {P}/api/message/status           | 是 |
 * | delete       | POST | {P}/api/message/delete           | 是 |
 *
 * 安全缺口修复：原匿名 `GET /api/message/list`（`list()` action）已**移除**，
 * 留言管理统一迁移至 `{CMS_PATH}/api/message/*` 并强制鉴权。
 */
class Message
{
    /**
     * 留言业务服务
     * @var MessageService
     */
    protected MessageService $service;

    /**
     * 依赖注入业务服务
     * @param MessageService $service
     */
    public function __construct(MessageService $service)
    {
        $this->service = $service;
    }

    /**
     * 提交留言（POST /api/message，前台匿名，保持不变）
     * @param Request $request
     * @return Response
     */
    public function submit(Request $request): Response
    {
        // 读取 JSON 请求体（兼容表单）
        $payload = $request->post();
        if (empty($payload)) {
            $payload = $request->param();
        }

        $ip = $request->ip();

        return $this->service->submit($payload, $ip);
    }

    /**
     * 留言列表（后台，需 AdminAuth）：分页 + 关键词 + 状态筛选
     * @param Request $request
     * @return Response
     */
    public function adminList(Request $request): Response
    {
        $page    = (int) $request->param('page', 1);
        $size    = (int) $request->param('size', 10);
        $keyword = (string) $request->param('keyword', '');

        // status 需区分「未传」与「0」：仅当显式传入时筛选
        $rawStatus = $request->param('status', null);
        $status    = null;
        if ($rawStatus !== null && $rawStatus !== '') {
            $status = ((int) $rawStatus) === 1 ? 1 : 0;
        }

        return $this->service->adminList($page, $size, $keyword, $status);
    }

    /**
     * 留言详情（后台，需 AdminAuth）
     * @param Request $request
     * @return Response
     */
    public function detail(Request $request): Response
    {
        return $this->service->detail((int) $request->param('id', 0));
    }

    /**
     * 标记留言处理状态（后台，需 AdminAuth；1=已处理写 handled_at，0=待处理清空）
     * @param Request $request
     * @return Response
     */
    public function markStatus(Request $request): Response
    {
        $payload = $request->post();
        if (empty($payload)) {
            $payload = $request->param();
        }

        $id     = (int) ($payload['id'] ?? 0);
        $status = ((int) ($payload['status'] ?? 0)) === 1 ? 1 : 0;

        return $this->service->markStatus($id, $status, $this->logContext($request));
    }

    /**
     * 删除留言（后台，需 AdminAuth）
     * @param Request $request
     * @return Response
     */
    public function delete(Request $request): Response
    {
        $payload = $request->post();
        if (empty($payload)) {
            $payload = $request->param();
        }

        return $this->service->remove((int) ($payload['id'] ?? 0), $this->logContext($request));
    }

    /**
     * 读取操作日志上下文（中间件注入 `$request->opLogContext`）
     * @param Request $request
     * @return OpLogContext|null
     */
    protected function logContext(Request $request): ?OpLogContext
    {
        $ctx = $request->opLogContext;

        return $ctx instanceof OpLogContext ? $ctx : null;
    }
}
