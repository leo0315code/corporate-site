<?php
declare(strict_types=1);

namespace app\service;

use app\model\Message as MessageModel;
use app\validate\MessageValidate;
use think\facade\Log;
use think\Response;

/**
 * 留言业务服务
 *
 * 职责：
 * - `submit()`     ：前台匿名提交（校验 → 幂等 → 落库）；
 * - `adminList()`  ：后台受鉴权列表（分页 + 关键词 + 状态筛选）；
 * - `detail()`     ：后台单条详情；
 * - `markStatus()` ：后台标记处理状态（0/1）并维护 `handled_at`；
 * - `remove()`     ：后台删除留言。
 */
class MessageService
{
    /**
     * 提交留言
     *
     * 处理顺序（关键）：先「基础归一化（去空白）」→ 再「服务端校验」→ 通过后「纵深截断」→ 落库。
     * 严禁在校验前截断，否则超长提交会被裁剪成合法长度而绕过校验。
     *
     * @param array<string, mixed> $payload 原始请求数据
     * @param string               $ip 提交者 IP
     * @return Response 统一响应结构
     */
    public function submit(array $payload, string $ip): Response
    {
        // 1) 基础归一化：仅去首尾空白、补默认空串（不做长度截断）
        $data = $this->normalize($payload);

        // 2) 服务端校验（最终裁决）—— 超长/缺失/格式错误在此阶段拦截并返回 1001
        $validate = new MessageValidate();
        if (!$validate->scene('submit')->check($data)) {
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        // 3) 校验通过后做纵深截断（防御性，正常情况下值已在合法范围内）
        $data = $this->enforceLimits($data);

        try {
            // 4) 防重复：同 IP + 同内容 60s 内视为重复，幂等返回成功且不重复入库
            $duplicate = MessageModel::findDuplicate($ip, $data['content']);
            if ($duplicate !== null) {
                // 记录审计日志（错误码 1002 仅备审计，不返回给前端）
                Log::info(sprintf(
                    '[message] 幂等重复提交 ip=%s content_hash=%s id=%d',
                    $ip,
                    md5($data['content']),
                    $duplicate->id
                ));
                return success();
            }

            // 5) 落库（company 为空时存 NULL）
            MessageModel::createMessage([
                'name'    => $data['name'],
                'company' => $data['company'] === '' ? null : $data['company'],
                'phone'   => $data['phone'],
                'email'   => $data['email'],
                'content' => $data['content'],
                'ip'      => $ip,
            ]);

            // 6) 预留扩展点：邮件/短信通知（P1-3），按需在此处调用
            // $this->notify($data);

            return success();
        } catch (\Throwable $e) {
            // 统一兜底：不回显堆栈，仅记录日志
            Log::error('[message] 提交失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 获取留言列表（后台管理，分页 + 关键词 + 状态筛选）
     *
     * 说明：本方法替代原匿名 `getList`（原接口已下线）。仅由受鉴权的
     * `{CMS_PATH}/api/message/list` 调用，故可返回完整字段（含 ip）。
     *
     * @param int         $page    页码，从 1 开始
     * @param int         $size    每页条数（1~50）
     * @param string      $keyword 关键词（姓名/公司/电话/邮箱/内容 模糊匹配）
     * @param int|null    $status  处理状态筛选：0=待处理 1=已处理；null=不筛选
     * @return Response 统一响应结构，data 为分页数据
     */
    public function adminList(int $page, int $size, string $keyword = '', ?int $status = null): Response
    {
        // 规范化分页参数
        $page = $page < 1 ? 1 : $page;
        $size = $size < 1 ? 10 : min($size, 50);

        try {
            $query = MessageModel::query();

            // 关键词搜索（多字段 OR，ORM 参数绑定）
            $keyword = trim($keyword);
            if ($keyword !== '') {
                $likeValue = '%' . $keyword . '%';
                $query->where(function ($q) use ($likeValue) {
                    $q->whereLike('name', $likeValue)
                        ->whereOr('company', 'like', $likeValue)
                        ->whereOr('phone', 'like', $likeValue)
                        ->whereOr('email', 'like', $likeValue)
                        ->whereOr('content', 'like', $likeValue);
                });
            }

            // 状态筛选
            if ($status !== null) {
                $query->where('status', $status === 1 ? 1 : 0);
            }

            $total = (clone $query)->count();

            $items = $query->order('id', 'desc')
                ->page($page, $size)
                ->select()
                ->toArray();

            return success([
                'total' => (int) $total,
                'page'  => $page,
                'size'  => $size,
                'items' => $items,
            ]);
        } catch (\Throwable $e) {
            Log::error('[message] 后台列表查询失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 留言详情（后台管理）
     * @param int $id 留言 ID
     * @return Response 未命中 → 4004
     */
    public function detail(int $id): Response
    {
        if ($id < 1) {
            return fail(error_code()['VALIDATE_FAIL'], '留言 ID 不合法');
        }

        try {
            /** @var MessageModel|null $row */
            $row = MessageModel::find($id);
            if ($row === null) {
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            return success($row->toArray());
        } catch (\Throwable $e) {
            Log::error('[message] 详情查询失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 标记留言处理状态（0=待处理 / 1=已处理）
     *
     * 语义：置为「已处理」写入 `handled_at`；回退为「待处理」清空 `handled_at`。
     * 埋点：**先取 `name` 后改**（用于 target_name）。
     *
     * @param int               $id     留言 ID
     * @param int               $status 目标状态（0 或 1）
     * @param OpLogContext|null $ctx    操作日志上下文
     * @return Response 未命中 → 4004
     */
    public function markStatus(int $id, int $status, ?OpLogContext $ctx = null): Response
    {
        if ($id < 1) {
            OpLogService::record('message', 'update', 0, '标记失败：留言 ID 不合法', (string) $id, '', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], '留言 ID 不合法');
        }

        try {
            /** @var MessageModel|null $row */
            $row = MessageModel::find($id);
            if ($row === null) {
                OpLogService::record('message', 'update', 0, '标记失败：资源不存在', (string) $id, '', $ctx);
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }
            $name = (string) $row->name; // 先取后改

            $ok = MessageModel::markStatus($id, $status);
            if (!$ok) {
                OpLogService::record('message', 'update', 0, '标记失败：资源不存在', (string) $id, $name, $ctx);
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            OpLogService::record(
                'message',
                'update',
                1,
                $status === 1 ? '标记为已处理' : '标记为待处理',
                (string) $id,
                $name,
                $ctx
            );

            return success();
        } catch (\Throwable $e) {
            Log::error('[message] 标记状态失败：' . $e->getMessage());
            OpLogService::record('message', 'update', 0, '标记异常', (string) $id, '', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 删除留言（后台管理）
     *
     * 埋点：**先取 `name` 后删**（删除后行不存在，无法再取）。
     *
     * @param int               $id  留言 ID
     * @param OpLogContext|null $ctx 操作日志上下文
     * @return Response 未命中 → 4004
     */
    public function remove(int $id, ?OpLogContext $ctx = null): Response
    {
        if ($id < 1) {
            OpLogService::record('message', 'delete', 0, '删除失败：留言 ID 不合法', (string) $id, '', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], '留言 ID 不合法');
        }

        try {
            /** @var MessageModel|null $row */
            $row = MessageModel::find($id);
            if ($row === null) {
                OpLogService::record('message', 'delete', 0, '删除失败：资源不存在', (string) $id, '', $ctx);
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            $name = (string) $row->name; // 先取后删
            $row->delete();

            OpLogService::record(
                'message',
                'delete',
                1,
                '删除留言：' . $name,
                (string) $id,
                $name,
                $ctx
            );

            return success();
        } catch (\Throwable $e) {
            Log::error('[message] 删除失败：' . $e->getMessage());
            OpLogService::record('message', 'delete', 0, '删除异常', (string) $id, '', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 基础归一化：去除首尾空白并补齐默认空串。
     * 注意：此处 **不** 做长度截断，长度校验交由 Validate 负责，避免掩盖校验失败。
     *
     * @param array<string, mixed> $payload 原始请求
     * @return array<string, string>
     */
    protected function normalize(array $payload): array
    {
        return [
            'name'    => trim((string) ($payload['name'] ?? '')),
            'company' => trim((string) ($payload['company'] ?? '')),
            'phone'   => trim((string) ($payload['phone'] ?? '')),
            'email'   => trim((string) ($payload['email'] ?? '')),
            'content' => trim((string) ($payload['content'] ?? '')),
        ];
    }

    /**
     * 纵深截断（防御性）：仅在校验通过后调用，确保写入值不超过字段上限。
     * 正常情况下 Validate 已保证长度合规，此处为落库前的最后一道保险。
     *
     * @param array<string, string> $data 已通过校验的数据
     * @return array<string, string>
     */
    protected function enforceLimits(array $data): array
    {
        return [
            'name'    => mb_substr($data['name'], 0, 30),
            'company' => mb_substr($data['company'], 0, 50),
            'phone'   => mb_substr($data['phone'], 0, 20),
            'email'   => mb_substr($data['email'], 0, 100),
            'content' => mb_substr($data['content'], 0, 500),
        ];
    }
}
