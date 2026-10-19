<?php
declare(strict_types=1);

namespace app\service;

use app\model\AdminSession;
use app\model\AdminUser;
use app\validate\AdminValidate;
use think\facade\Db;
use think\facade\Log;
use think\Response;

/**
 * 后台账号管理服务（账号管理，**不含 RBAC**）
 *
 * 职责（P1 前置能力，见 PRD C-P1-4「多管理员」）：
 * - `list()`         ：账号列表（分页 + 账号名关键词），并标注当前登录者；
 * - `create()`       ：新建账号（服务端生成随机强密码，**仅本次返回**）；
 * - `toggleStatus()` ：启用 / 停用（停用后立即踢下线）；
 * - `resetPassword()`：为他人重置密码（随机强密码 + 强制首次改密 + 踢下线）；
 * - `remove()`       ：硬删除（需输入账号名二次确认）。
 *
 * 安全与一致性约束（**全部在服务端裁决，前端只是提示**）：
 *  1. 「停用 / 删除 / 重置」**不得作用于自己**：避免一次误操作把自己锁在门外。
 *     其中「重置自己密码」会因 `revokeAll()` 立刻踢掉本端会话，而随机密码只在
 *     一次性提示中展示 → 极易永久丢失访问权，故明确禁止，改密请走 `Auth/changepassword`。
 *  2. **主账号（`is_primary = 1`）不得被停用 / 删除**：主账号是 `cms:init` 创建的初始入口，
 *     任何管理员（包括其他管理员）都不能停用或删除它，防止「新建账号后把初始账号踢掉、
 *     从此无人能追溯系统归属」。主账号**不带来额外权限**，只作为一道护栏；
 *     如需更换主账号，请在数据库/CLI 侧操作（界面不提供转移入口）。
 *  3. **至少保留 1 个启用账号**：停用 / 删除启用账号前在事务内加锁重算，
 *     否则后台将无人可登录（只能退回 CLI）。
 *  4. 新增 / 重置的密码一律**服务端随机生成**（`random_strong_password()`：大/小写+数字+符号），
 *     接口**只返回这一次**，不入日志、不落库明文；且固定 `must_change_password=1`。
 *  5. 停用 / 重置 / 删除成功后立即 `AdminSession::revokeAll()` → **立即失效**，无需等 Token 过期。
 *  6. 密码哈希（`password_hash`）**永不出库**（模型 `$hidden` 隐藏），任何响应 / 日志均不含明文或哈希。
 *
 * 操作日志（C-P1-3）：
 * - 操作人以 **`OpLogContext $ctx`** 显式传入（替换原裸 `int $currentAdminId`；ctx 已含
 *   `adminId / adminName / ip / userAgent`，一次带齐「操作人 + 请求来源」，故不再传裸 `AdminUser`）。
 *   与 `ContentService` / `MessageService` / `UploadService` 保持一致，由 `AdminAuth` 在鉴权边界
 *   注入 `$request->opLogContext`，Controller 透传 → 审计行**均有真实 ip**。
 * - **事务与日志顺序**：`toggleStatus` / `remove` 的守卫在 `Db::transaction()` 内，
 *   为避免「闭包内写日志 + 后续异常回滚」吞掉失败日志，统一**先执行事务、拿到 Response
 *   后再在事务外按 code 记日志**（目标名 / 失败原因经 by-ref 捕获）。
 * - **幂等无变化不记**：目标状态已达成时（`status` 未改变）不写日志（PRD §5.1）。
 *
 * 说明（为何不新增错误码）：账号名重复沿用 `1002`（重复）；「不得停用自己」「主账号不可停用」
 * 「至少保留 1 个启用账号」「账号名确认不一致」等**业务规则拒绝**沿用 `1001`（参数不合法），
 * 并配合**明确的中文 message**；前端展示策略为「后端优先展示 message」，故无需为这类规则扩增错误码表。
 */
class AdminService
{
    /** 新建 / 重置后的初始密码长度（与 `cms:init` 保持一致） */
    protected const PWD_LENGTH = 16;

    /**
     * 账号列表（分页 + 账号名关键词）
     *
     * 返回项由 `AdminUser::toAdminItem()` 生成（**永不含密码哈希**），
     * 并额外附带 `is_self`，供前端在「自己」那一行禁用危险操作按钮。
     *
     * 说明：列表为**只读操作**，不写操作日志（PRD §5.1：状态未改变不记）。
     *
     * @param int          $page    页码，从 1 开始
     * @param int          $size    每页条数（1~50）
     * @param string       $keyword 账号名关键词（模糊匹配）
     * @param OpLogContext $ctx     操作日志上下文（含操作人 id/name + ip + ua；此处仅用 adminId 标注 is_self）
     * @return Response 统一响应结构，data 为分页数据
     */
    public function list(int $page, int $size, string $keyword, OpLogContext $ctx): Response
    {
        $page       = $page < 1 ? 1 : $page;
        $size       = $size < 1 ? 10 : min($size, 50);
        $currentId  = $ctx->adminId;

        try {
            $query = AdminUser::query();

            $keyword = trim($keyword);
            if ($keyword !== '') {
                $query->whereLike('username', '%' . $keyword . '%');
            }

            $total = (clone $query)->count();

            /** @var \think\Collection $rows */
            $rows = $query->order('id', 'desc')
                ->page($page, $size)
                ->select();

            $items = [];
            foreach ($rows as $row) {
                $item           = $row->toAdminItem();
                $item['is_self'] = (int) $row->id === $currentId;
                $items[]        = $item;
            }

            return success([
                'total' => (int) $total,
                'page'  => $page,
                'size'  => $size,
                'items' => $items,
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:admin] 账号列表查询失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 新建后台账号
     *
     * 流程：账号名格式校验 → 查重（**含被停用账号**，避免撞唯一索引）→ 建号并返回一次性随机密码。
     *
     * 操作日志：成功 `account/create`，`target=target_name=username`，
     * `detail=新建账号 {username}（普通账号）`；失败 `result=0`（校验 / 重名 / 异常）。
     * **绝不记录随机密码明文**。
     *
     * @param string       $username 登录账号
     * @param OpLogContext $ctx      操作日志上下文（含操作人 + ip + ua）
     * @return Response 成功时 data = { id, username, password }（password 仅此一次返回）
     */
    public function create(string $username, OpLogContext $ctx): Response
    {
        $username = trim($username);

        $validate = new AdminValidate();
        if (!$validate->scene('adminCreate')->check(['username' => $username])) {
            OpLogService::record('account', 'create', 0, '新建失败：' . $validate->getError(), $username, $username, $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        try {
            // 查重必须覆盖「已停用」账号：唯一索引 uk_username 不区分 status
            if (AdminUser::findByUsername($username) !== null) {
                OpLogService::record('account', 'create', 0, '新建失败：账号已存在', $username, $username, $ctx);
                return fail(error_code()['DUPLICATE'], '该账号已存在，请更换账号名');
            }

            $password = random_strong_password(self::PWD_LENGTH);
            $user     = AdminUser::createAccount($username, $password);

            // 审计日志：记录操作事实，**绝不记录密码明文**
            Log::info(sprintf('[cms:admin] 新建账号 username=%s admin_id=%d', $username, $user->id));

            OpLogService::record('account', 'create', 1, '新建账号 ' . $username . '（普通账号）', $username, $username, $ctx);

            return success([
                'id'       => (int) $user->id,
                'username' => (string) $user->username,
                'password' => $password,
            ]);
        } catch (\Throwable $e) {
            // 并发下仍可能撞唯一索引（1062）→ 归一化为「已存在」，而非 5000
            if (str_contains($e->getMessage(), '1062') || stripos($e->getMessage(), 'Duplicate entry') !== false) {
                OpLogService::record('account', 'create', 0, '新建失败：账号已存在', $username, $username, $ctx);
                return fail(error_code()['DUPLICATE'], '该账号已存在，请更换账号名');
            }

            Log::error('[cms:admin] 新建账号失败：' . $e->getMessage());
            OpLogService::record('account', 'create', 0, '新建失败：异常', $username, $username, $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 启用 / 停用账号
     *
     * 守卫（同一事务内加锁判定）：
     * - `status` 仅接受 0 / 1（其它值 → 1001，**绝不静默归一化为「停用」**）；
     * - 目标账号必须存在（否则 4004）；
     * - **不得停用自己**（否则 1001）；
     * - **不得停用主账号**（否则 1001）——主账号是初始入口，停用它等于把系统归属抹掉；
     * - 停用后**必须仍有至少 1 个启用账号**（否则 1001）；
     * - 停用成功 → `revokeAll()`，该账号所有在线会话**立即失效**；
     * - 目标状态已达成时幂等返回成功（不重复写库，**且不写操作日志**）。
     *
     * 操作日志：`account/enable|disable`，`target=target_name=username`，
     * `detail=启用/停用账号 {username}`；失败 `result=0`（按具体守卫原因）；
     * **幂等无变化不记**（PRD §5.1）。
     *
     * @param int          $id     目标账号 ID
     * @param int          $status 目标状态：1=启用 0=停用
     * @param OpLogContext $ctx    操作日志上下文（含操作人 + ip + ua）
     * @return Response 统一响应结构
     */
    public function toggleStatus(int $id, int $status, OpLogContext $ctx): Response
    {
        $actorId = $ctx->adminId;

        $validate = new AdminValidate();
        if (!$validate->scene('adminToggleStatus')->check(['id' => $id, 'status' => $status])) {
            $verb = $status === 1 ? '启用' : '停用';
            OpLogService::record('account', $status === 1 ? 'enable' : 'disable', 0, $verb . '失败：' . $validate->getError(), (string) $id, '', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        // 校验已保证 status ∈ {0,1}；此处仅为类型收敛
        $target = $status === 1 ? 1 : 0;
        $action = $target === 1 ? 'enable' : 'disable';
        $verb   = $target === 1 ? '启用' : '停用';

        // 事务外记日志所需的捕获变量（目标名 / 失败原因 / 幂等无变化标记）
        $name   = '';
        $reason = '';
        $noop   = false;

        try {
            /** @var Response $resp */
            $resp = Db::transaction(function () use ($id, $target, $actorId, $verb, &$name, &$reason, &$noop) {
                // 加锁读全部启用账号：保证「至少保留 1 个启用」判定的串行化
                /** @var array<int, int> $enabledIds */
                $enabledIds = AdminUser::where('status', 1)->lock(true)->column('id');

                /** @var AdminUser|null $user */
                $user = AdminUser::find($id);
                if (!$user instanceof AdminUser) {
                    $reason = $verb . '失败：资源不存在';
                    return fail(error_code()['NOT_FOUND'], '资源不存在');
                }

                $name = (string) $user->username;

                if ((int) $user->status === $target) {
                    $noop = true;               // 幂等：目标状态已达成，直接成功（不写日志）
                    return success();
                }

                if ($target === 0) {
                    if ((int) $user->id === $actorId) {
                        $reason = '停用失败：不能停用当前登录的账号';
                        return fail(error_code()['VALIDATE_FAIL'], '不能停用当前登录的账号');
                    }

                    // 主账号是初始入口：任何管理员都不得停用它（否则系统归属被抹掉）
                    if ($user->isPrimary()) {
                        $reason = '停用失败：主账号不可停用';
                        return fail(error_code()['VALIDATE_FAIL'], '主账号不可停用');
                    }

                    // 停用后若不再有启用账号 → 后台将无人可登录
                    if (count($enabledIds) <= 1) {
                        $reason = '停用失败：系统至少需保留 1 个启用账号';
                        return fail(error_code()['VALIDATE_FAIL'], '系统至少需保留 1 个启用账号');
                    }
                }

                $user->setStatus($target);

                if ($target === 0) {
                    // 停用即踢下线：立即作废该账号全部会话
                    AdminSession::revokeAll((int) $user->id);
                }

                Log::info(sprintf(
                    '[cms:admin] 账号状态变更 username=%s target_id=%d status=%d operator_id=%d',
                    (string) $user->username,
                    $user->id,
                    $target,
                    $actorId
                ));

                return success();
            });
        } catch (\Throwable $e) {
            Log::error('[cms:admin] 账号状态变更失败：' . $e->getMessage());
            OpLogService::record('account', $action, 0, $verb . '失败：异常', $name !== '' ? $name : (string) $id, $name, $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }

        // 事务外按 code 记日志（避免回滚吞掉失败日志）
        if (!$noop) {
            if ($this->respCode($resp) === 0) {
                OpLogService::record('account', $action, 1, $verb . '账号 ' . $name, $name, $name, $ctx);
            } else {
                OpLogService::record('account', $action, 0, $reason, $name, $name, $ctx);
            }
        }

        return $resp;
    }

    /**
     * 重置他人密码（代发新初始密码）
     *
     * 守卫：
     * - 目标账号必须存在（否则 4004）；
     * - **不得重置自己**（否则 1001）——重置会立刻作废本端会话，而随机密码仅一次性展示，
     *   极易导致自己永久失去访问权；本人改密请使用「修改密码」页。
     *
     * 成功：写入新随机强密码哈希、置 `must_change_password=1`、`revokeAll()` 踢下线。
     *
     * 操作日志：`account/reset_password`，`detail=重置 {username} 密码（一次性密码，未记录）`
     * （**绝不含明文密码**，PRD §9 第 5 条）；失败 `result=0`。
     *
     * @param int          $id  目标账号 ID
     * @param OpLogContext $ctx 操作日志上下文（含操作人 + ip + ua）
     * @return Response 成功时 data = { id, username, password }（password 仅此一次返回）
     */
    public function resetPassword(int $id, OpLogContext $ctx): Response
    {
        if ($id < 1) {
            OpLogService::record('account', 'reset_password', 0, '重置密码失败：参数不合法', (string) $id, '', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], '参数不合法');
        }

        try {
            /** @var AdminUser|null $user */
            $user = AdminUser::find($id);
            if (!$user instanceof AdminUser) {
                OpLogService::record('account', 'reset_password', 0, '重置密码失败：资源不存在', (string) $id, '', $ctx);
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            $name = (string) $user->username;

            if ((int) $user->id === $ctx->adminId) {
                OpLogService::record('account', 'reset_password', 0, '重置密码失败：不能重置自己的密码', $name, $name, $ctx);
                return fail(
                    error_code()['VALIDATE_FAIL'],
                    '不能重置当前登录账号的密码，请在「修改密码」中修改'
                );
            }

            $password = random_strong_password(self::PWD_LENGTH);
            $user->resetPasswordTo($password);

            // 立即失效该账号的全部会话（对方需用新密码重新登录）
            AdminSession::revokeAll((int) $user->id);

            Log::info(sprintf(
                '[cms:admin] 重置密码 username=%s target_id=%d operator_id=%d',
                $name,
                $user->id,
                $ctx->adminId
            ));

            OpLogService::record('account', 'reset_password', 1, '重置 ' . $name . ' 密码（一次性密码，未记录）', $name, $name, $ctx);

            return success([
                'id'       => (int) $user->id,
                'username' => (string) $user->username,
                'password' => $password,
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:admin] 重置密码失败：' . $e->getMessage());
            OpLogService::record('account', 'reset_password', 0, '重置密码失败：异常', '', '', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 删除账号（硬删除，需账号名二次确认）
     *
     * 守卫（同一事务内加锁判定）：
     * - 目标账号必须存在（否则 4004）；
     * - 请求携带的 `username` 必须与该账号**完全一致**（否则 1001）——防误删的最后闸门；
     * - **不得删除自己**（否则 1001）；
     * - **不得删除主账号**（否则 1001）——避免初始入口被彻底抹除；
     * - 删除后**必须仍有至少 1 个启用账号**（否则 1001）。
     *
     * 说明：删除为物理删除；其名下会话一并作废（避免遗留无效 Token）。
     *
     * 操作日志：`account/delete`，`target=target_name=username`，`detail=删除账号 {username}`
     * （**先取 username 后删**，删除后无法再取）；失败 `result=0`（按具体守卫原因）。
     *
     * @param int          $id       目标账号 ID
     * @param string       $username 二次确认的账号名（须与目标账号一致）
     * @param OpLogContext $ctx      操作日志上下文（含操作人 + ip + ua）
     * @return Response 统一响应结构
     */
    public function remove(int $id, string $username, OpLogContext $ctx): Response
    {
        $username = trim($username);
        $actorId  = $ctx->adminId;

        $validate = new AdminValidate();
        if (!$validate->scene('adminDelete')->check(['id' => $id, 'confirm_username' => $username])) {
            OpLogService::record('account', 'delete', 0, '删除失败：' . $validate->getError(), (string) $id, '', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        // 事务外记日志所需的捕获变量
        $name   = '';
        $reason = '';

        try {
            /** @var Response $resp */
            $resp = Db::transaction(function () use ($id, $username, $actorId, &$name, &$reason) {
                // 加锁读全部启用账号：保证「至少保留 1 个启用」判定的串行化
                /** @var array<int, int> $enabledIds */
                $enabledIds = AdminUser::where('status', 1)->lock(true)->column('id');

                /** @var AdminUser|null $user */
                $user = AdminUser::find($id);
                if (!$user instanceof AdminUser) {
                    $reason = '删除失败：资源不存在';
                    return fail(error_code()['NOT_FOUND'], '资源不存在');
                }

                // 先取目标名（删除后行不存在，无法再取）
                $name = (string) $user->username;

                // 二次确认：账号名必须完全一致（大小写敏感，杜绝「凭 ID 误删」）
                if (!hash_equals((string) $user->username, $username)) {
                    $reason = '删除失败：账号名与目标账号不一致';
                    return fail(error_code()['VALIDATE_FAIL'], '账号名与目标账号不一致，已取消删除');
                }

                if ((int) $user->id === $actorId) {
                    $reason = '删除失败：不能删除当前登录的账号';
                    return fail(error_code()['VALIDATE_FAIL'], '不能删除当前登录的账号');
                }

                // 主账号不可删除：它是系统初始入口，删掉将无法再追溯归属
                if ($user->isPrimary()) {
                    $reason = '删除失败：主账号不可删除';
                    return fail(error_code()['VALIDATE_FAIL'], '主账号不可删除');
                }

                // 删除启用账号前，确认删完后仍有启用账号
                if ((int) $user->status === 1 && count($enabledIds) <= 1) {
                    $reason = '删除失败：系统至少需保留 1 个启用账号';
                    return fail(error_code()['VALIDATE_FAIL'], '系统至少需保留 1 个启用账号');
                }

                AdminSession::revokeAll((int) $user->id);

                $deleted = (string) $user->username;
                $user->delete();

                Log::info(sprintf(
                    '[cms:admin] 删除账号 username=%s target_id=%d operator_id=%d',
                    $deleted,
                    $id,
                    $actorId
                ));

                return success();
            });
        } catch (\Throwable $e) {
            Log::error('[cms:admin] 删除账号失败：' . $e->getMessage());
            OpLogService::record('account', 'delete', 0, '删除失败：异常', $name !== '' ? $name : (string) $id, $name, $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }

        // 事务外按 code 记日志（避免回滚吞掉失败日志）
        if ($this->respCode($resp) === 0) {
            OpLogService::record('account', 'delete', 1, '删除账号 ' . $name, $name, $name, $ctx);
        } else {
            OpLogService::record('account', 'delete', 0, $reason, $name, $name, $ctx);
        }

        return $resp;
    }

    /**
     * 读取统一响应中的业务码（无 code 视为 5000）
     * @param Response $resp 业务返回
     * @return int 业务码（0=成功）
     */
    protected function respCode(Response $resp): int
    {
        $data = $resp->getData();

        if (is_array($data) && isset($data['code'])) {
            return (int) $data['code'];
        }

        return 5000;
    }
}
