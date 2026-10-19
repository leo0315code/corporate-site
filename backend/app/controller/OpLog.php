<?php
declare(strict_types=1);

namespace app\controller;

use app\service\OpLogService;
use think\Request;
use think\Response;

/**
 * 操作日志控制器（**只读**；整组挂载在 AdminAuth 之内 → 必须登录）
 *
 * action 命名（**必须与 `route/app.php` 注册保持一致**）：
 * | action | 方法 | 路由（{P} = CMS_PATH）      | 鉴权 |
 * | ------ | ---- | --------------------------- | ---- |
 * | list   | GET  | {P}/api/oplog/list          | 是（若未改初始密码 → 1006） |
 * | detail | GET  | {P}/api/oplog/detail        | 是 |
 *
 * 说明：
 * - 本控制器 action 名**均不在** `AdminAuth::$pwdWhitelist` 内 → 未改初始密码时返回 1006；
 * - 只读：**不提供** 新增 / 修改 / 删除接口（审计流水只增不改，PRD §8.2）；
 * - 查询参数：`page,size,module,admin_name,result,keyword,start_date,end_date`（取参与 `Message` 风格一致）；
 * - 参数校验 / 默认最近 7 天 / 倒序分页等业务逻辑均在 `OpLogService` 内实现。
 *
 * RBAC 预留（A-OPLOG-8）：本期所有管理员均可查；待 C-P2-2 RBAC 落地后，
 * 在此控制器（或 AdminAuth 中间件）增加「查看日志」权限位判定即可收敛访问。
 */
class OpLog
{
    /**
     * 操作日志查询服务
     * @var OpLogService
     */
    protected OpLogService $service;

    /**
     * 依赖注入业务服务
     * @param OpLogService $service
     */
    public function __construct(OpLogService $service)
    {
        $this->service = $service;
    }

    /**
     * 日志列表（GET {P}/api/oplog/list）
     *
     * 支持组合筛选：`page,size,module,admin_name,result,keyword,start_date,end_date`。
     * `result` 需区分「未传」与「传 0」：仅当显式传入时筛选（`null` = 不限）。
     *
     * @param Request $request
     * @return Response 统一响应结构，data = {total,page,size,items}
     */
    public function list(Request $request): Response
    {
        $page    = (int) $request->param('page', 1);
        $size    = (int) $request->param('size', 10);
        $module  = (string) $request->param('module', '');
        $admin   = (string) $request->param('admin_name', '');
        $keyword = (string) $request->param('keyword', '');
        $start   = (string) $request->param('start_date', '');
        $end     = (string) $request->param('end_date', '');

        // result 需区分「未传」与「0」：仅当显式传入且非空串时筛选
        $rawResult = $request->param('result', null);
        $result    = null;
        if ($rawResult !== null && $rawResult !== '') {
            $result = (int) $rawResult;
        }

        return $this->service->list($page, $size, $module, $admin, $result, $keyword, $start, $end);
    }

    /**
     * 日志详情（GET {P}/api/oplog/detail?id=）
     * @param Request $request
     * @return Response 统一响应结构，data = OpLogItem；未命中 → 4004
     */
    public function detail(Request $request): Response
    {
        return $this->service->detail((int) $request->param('id', 0));
    }
}
