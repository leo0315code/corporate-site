<?php
declare(strict_types=1);

namespace app\service;

use app\model\OpLog;
use think\facade\Log;
use think\Response;

/**
 * 操作日志服务（写入器 + 只读查询）
 *
 * 职责：
 * - `record()`（**static**）：无状态、跨模块调用的**横切副作用**写入器，与既有
 *   `LoginAttempt::recordFail` / `AdminSession::issue` 静态风格一致；
 * - `list()` / `detail()`（实例）：常规读服务，注入进 `OpLog` 控制器。
 *
 * 铁律（PRD §9）：
 * - 写入**旁路**：`record()` 内部 `try/catch` 全包，异常只 `Log::error`，**绝不抛出**；
 * - **字段白名单**：`buildRow()` 用具名参数构造，再 `array_intersect_key` 收口，任何未来
 *   「顺手多记敏感字段」都会被丢弃；
 * - 登录失败统一文案、不区分账号是否存在（防枚举）。
 */
final class OpLogService
{
    /**
     * 允许写入的字段白名单（PRD §4 定义的 12 字段；id/created_at 由系统填）
     * @var string[]
     */
    private const ALLOWED_FIELDS = [
        'admin_id', 'admin_name', 'created_at', 'module', 'action',
        'target', 'target_name', 'ip', 'user_agent', 'result', 'detail',
    ];

    /**
     * 模块枚举（与 PRD §4.2 冻结值一致）
     * @var string[]
     */
    public const MODULES = [
        'auth', 'product', 'news', 'case', 'advantage',
        'about', 'site', 'message', 'account', 'upload',
    ];

    /**
     * 动作枚举（与 PRD §4.3 冻结值一致）
     * @var string[]
     */
    public const ACTIONS = [
        'login', 'logout', 'create', 'update', 'delete',
        'enable', 'disable', 'reset_password', 'change_password', 'upload',
    ];

    /**
     * 记录一条操作日志（旁路：任何异常都不抛出，仅 Log::error）
     *
     * @param string              $module     模块枚举（见 PRD §4.2）
     * @param string              $action     动作枚举（见 PRD §4.3）
     * @param int                 $result     1=成功 0=失败
     * @param string              $detail     变化摘要 / 失败原因（≤500，超长截断加 …）
     * @param string              $target     目标可读标识（≤120）
     * @param string              $targetName 目标人类可读名（≤120）
     * @param OpLogContext|null   $ctx        操作人上下文（null=CLI/未知）
     * @return void
     */
    public static function record(
        string $module,
        string $action,
        int $result,
        string $detail = '',
        string $target = '',
        string $targetName = '',
        ?OpLogContext $ctx = null
    ): void {
        try {
            OpLog::create(self::buildRow($module, $action, $result, $detail, $target, $targetName, $ctx));
        } catch (\Throwable $e) {
            // 旁路：绝不抛出，仅记框架日志，避免「静默丢日志」
            Log::error('[cms:oplog] 写入失败：' . $e->getMessage());
        }
    }

    /**
     * 查询列表（分页 + 6 项筛选 + 默认倒序、默认最近 7 天）
     *
     * @param int         $page      页码（>=1）
     * @param int         $size      每页条数（1~50）
     * @param string      $module    模块筛选（枚举，空=全部）
     * @param string      $adminName 操作人账号名筛选（空=全部）
     * @param int|null    $result    结果筛选：0/1；null=不筛选（区分「未传」与「传 0」）
     * @param string      $keyword   关键词（模糊匹配 target/target_name/detail）
     * @param string      $startDate 开始日期 YYYY-MM-DD（空=不限）
     * @param string      $endDate   结束日期 YYYY-MM-DD（空=不限）
     * @return Response 统一响应，data = {total,page,size,items}
     */
    public function list(
        int $page,
        int $size,
        string $module = '',
        string $adminName = '',
        ?int $result = null,
        string $keyword = '',
        string $startDate = '',
        string $endDate = ''
    ): Response {
        $code = error_code();

        // 1) 参数校验（非法 → 1001）
        if ($module !== '' && !in_array($module, self::MODULES, true)) {
            return fail($code['VALIDATE_FAIL'], '模块参数不合法');
        }
        if ($result !== null && !in_array($result, [0, 1], true)) {
            return fail($code['VALIDATE_FAIL'], '结果参数不合法');
        }

        $startTs = $this->parseDate($startDate);
        $endTs   = $this->parseDate($endDate);
        if ($startDate !== '' && $startTs === null) {
            return fail($code['VALIDATE_FAIL'], '开始日期格式不合法');
        }
        if ($endDate !== '' && $endTs === null) {
            return fail($code['VALIDATE_FAIL'], '结束日期格式不合法');
        }
        if ($startTs !== null && $endTs !== null && $startTs > $endTs) {
            return fail($code['VALIDATE_FAIL'], '时间范围不合法');
        }

        $page = $page < 1 ? 1 : $page;
        $size = $size < 1 ? 10 : min($size, 50);

        try {
            $query = OpLog::query();

            if ($module !== '') {
                $query->where('module', $module);
            }
            if ($adminName !== '') {
                $query->where('admin_name', $adminName);
            }
            if ($result !== null) {
                $query->where('result', $result);
            }

            // 默认最近 7 天（未传任何日期时补齐，避免全表扫描）
            if ($startTs === null && $endTs === null) {
                $startTs = strtotime('-7 days');
            }
            if ($startTs !== null) {
                $query->where('created_at', '>=', date('Y-m-d 00:00:00', $startTs));
            }
            if ($endTs !== null) {
                $query->where('created_at', '<=', date('Y-m-d 23:59:59', $endTs));
            }

            // 关键词模糊匹配（target / target_name / detail）
            if (trim($keyword) !== '') {
                $like = '%' . trim($keyword) . '%';
                $query->where(function ($w) use ($like) {
                    $w->whereLike('target', $like)
                        ->whereOr('target_name', 'like', $like)
                        ->whereOr('detail', 'like', $like);
                });
            }

            $total = (clone $query)->count();
            $rows  = $query->order('created_at', 'desc')
                ->order('id', 'desc')
                ->page($page, $size)
                ->select();

            $items = array_map(static fn ($r): array => $r->toLogItem(), $rows->all());

            return success([
                'total' => (int) $total,
                'page'  => $page,
                'size'  => $size,
                'items' => $items,
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:oplog] 列表查询失败：' . $e->getMessage());
            return fail($code['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 单条详情（未命中 → 4004）
     * @param int $id 日志 ID
     * @return Response 统一响应，data = OpLogItem
     */
    public function detail(int $id): Response
    {
        $code = error_code();

        if ($id < 1) {
            return fail($code['VALIDATE_FAIL'], '日志 ID 不合法');
        }

        try {
            /** @var OpLog|null $row */
            $row = OpLog::find($id);
            if ($row === null) {
                return fail($code['NOT_FOUND'], '资源不存在');
            }

            return success($row->toLogItem());
        } catch (\Throwable $e) {
            Log::error('[cms:oplog] 详情查询失败：' . $e->getMessage());
            return fail($code['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 从固定具名参数构造待写入行，并用字段白名单收口
     *
     * @param string            $module
     * @param string            $action
     * @param int               $result
     * @param string            $detail
     * @param string            $target
     * @param string            $targetName
     * @param OpLogContext|null $ctx
     * @return array<string, mixed> 仅含白名单字段
     */
    private static function buildRow(
        string $module,
        string $action,
        int $result,
        string $detail,
        string $target,
        string $targetName,
        ?OpLogContext $ctx
    ): array {
        $ctx = $ctx ?? OpLogContext::system();

        $raw = [
            'admin_id'    => $ctx->adminId,
            'admin_name'  => self::clip($ctx->adminName, 50),
            'created_at'  => date('Y-m-d H:i:s'), // 服务端时间，防伪造
            'module'      => self::clip($module, 20),
            'action'      => self::clip($action, 20),
            'target'      => self::clip($target, 120),
            'target_name' => self::clip($targetName, 120),
            'ip'          => self::clip($ctx->ip, 45),
            'user_agent'  => self::clip($ctx->userAgent, 255),
            'result'      => $result === 1 ? 1 : 0,
            'detail'      => self::clipWithEllipsis($detail, 500),
        ];

        // 白名单收口：任何白名单以外的键（如未来误加 password）一律丢弃
        return array_intersect_key($raw, array_flip(self::ALLOWED_FIELDS));
    }

    /**
     * 清洗并截断字符串：trim → 去控制字符 → mb_substr 截断
     * @param string $value     原始值
     * @param int    $maxLength 最大长度
     * @return string
     */
    private static function clip(string $value, int $maxLength): string
    {
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', trim($value));

        return mb_substr($clean ?? '', 0, $maxLength);
    }

    /**
     * 清洗并截断（超长时截断并追加 …）
     * @param string $value     原始值
     * @param int    $maxLength 最大长度（含省略号）
     * @return string
     */
    private static function clipWithEllipsis(string $value, int $maxLength): string
    {
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', trim($value)) ?? '';

        if (mb_strlen($clean) <= $maxLength) {
            return $clean;
        }

        return mb_substr($clean, 0, $maxLength - 1) . '…';
    }

    /**
     * 解析 `YYYY-MM-DD` 日期为当日 00:00 时间戳
     * @param string $date 日期字符串（空=null）
     * @return int|null 解析失败返回 null；空串返回 null
     */
    private function parseDate(string $date): ?int
    {
        $date = trim($date);
        if ($date === '') {
            return null;
        }

        // 严格匹配 YYYY-MM-DD，避免 strtotime 对宽松格式的误判
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) !== 1) {
            return null;
        }
        if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }

        $ts = strtotime($date . ' 00:00:00');

        return $ts === false ? null : $ts;
    }
}
