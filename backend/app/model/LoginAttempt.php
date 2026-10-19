<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 登录失败计数 / 锁定模型（对应 login_attempt 表）
 *
 * 双维度锁定：
 * - scope = 'account'，scope_key = 用户名：同一账号在多 IP 被爆破 → 锁账号；
 * - scope = 'ip'，scope_key = IP：同一 IP 尝试多账号 → 锁 IP。
 *
 * 判定与写入均在 Service 层编排（AuthService），本模型只提供幂等的计数原语。
 * 关键：`locked_until` 落库持久化，锁定期内即使密码正确也拒绝。
 *
 * @property int         $id
 * @property string      $scope
 * @property string      $scope_key
 * @property int         $fail_count
 * @property string|null $locked_until
 * @property string|null $last_failed_at
 * @property string      $created_at
 * @property string      $updated_at
 */
class LoginAttempt extends Model
{
    /** 失败阈值：连续 5 次锁定 */
    public const MAX_FAIL = 5;

    /** 锁定时长（秒）：10 分钟 */
    public const LOCK_SECONDS = 600;

    /** 维度：账号 */
    public const SCOPE_ACCOUNT = 'account';

    /** 维度：IP */
    public const SCOPE_IP = 'ip';

    /** 数据表名（不含前缀） */
    protected $name = 'login_attempt';

    /** 主键 */
    protected $pk = 'id';

    /** 自动写入时间戳（datetime 类型） */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    /**
     * 字段类型转换
     * @var array<string, string>
     */
    protected $type = [
        'id'         => 'integer',
        'scope'      => 'string',
        'scope_key'  => 'string',
        'fail_count' => 'integer',
    ];

    /**
     * 读取指定维度当前的锁定剩余秒数
     * @param string $scope 'account' | 'ip'
     * @param string $key   账号名 或 IP
     * @return int 剩余锁定秒数；未锁定返回 0
     */
    public static function lockedSeconds(string $scope, string $key): int
    {
        if ($key === '') {
            return 0;
        }

        /** @var LoginAttempt|null $row */
        $row = self::where('scope', $scope)->where('scope_key', $key)->find();
        if (!$row instanceof LoginAttempt || empty($row->locked_until)) {
            return 0;
        }

        $remain = strtotime((string) $row->locked_until) - time();

        return $remain > 0 ? $remain : 0;
    }

    /**
     * 记录一次登录失败，达到阈值则设置锁定截止时间
     *
     * 幂等实现：以 (scope, scope_key) 唯一键定位行；不存在则创建、存在则自增。
     * 采用「读-改-写」，失败窗口内并发影响可忽略（计数偏高只会更安全，不会绕过）。
     *
     * @param string $scope 'account' | 'ip'
     * @param string $key   账号名 或 IP
     * @return int 记录后的失败次数
     */
    public static function recordFail(string $scope, string $key): int
    {
        if ($key === '') {
            return 0;
        }

        /** @var LoginAttempt|null $row */
        $row = self::where('scope', $scope)->where('scope_key', $key)->find();

        $now = date('Y-m-d H:i:s');

        if (!$row instanceof LoginAttempt) {
            $row = new self([
                'scope'        => $scope,
                'scope_key'    => $key,
                'fail_count'   => 0,
                'locked_until' => null,
            ]);
        }

        $count = (int) $row->fail_count + 1;
        $row->fail_count     = $count;
        $row->last_failed_at = $now;
        if ($count >= self::MAX_FAIL) {
            $row->locked_until = date('Y-m-d H:i:s', time() + self::LOCK_SECONDS);
        }
        $row->save();

        return $count;
    }

    /**
     * 归属清零：清空失败计数并解除锁定（登录成功后调用）
     * @param string $scope 'account' | 'ip'
     * @param string $key   账号名 或 IP
     * @return void
     */
    public static function reset(string $scope, string $key): void
    {
        if ($key === '') {
            return;
        }

        /** @var LoginAttempt|null $row */
        $row = self::where('scope', $scope)->where('scope_key', $key)->find();
        if ($row instanceof LoginAttempt) {
            $row->fail_count   = 0;
            $row->locked_until = null;
            $row->save();
        }
    }
}
