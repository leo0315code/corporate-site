<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 后台会话模型（对应 admin_session 表）
 *
 * 职责：签发 / 校验 / 作废会话 Token。
 * - Token 为 32 字节随机数的 64 位十六进制串（`random_bytes(32)`）。
 * - 有效期固定 2 小时（TTL = 7200 秒）。
 * - 登出 / 改密后立即作废（删除记录）。
 *
 * @property int    $id
 * @property int    $admin_id
 * @property string $token
 * @property string $expires_at
 * @property string $ip
 * @property string $user_agent
 * @property string $created_at
 * @property string $updated_at
 */
class AdminSession extends Model
{
    /** Token 有效期（秒）：2 小时 */
    public const TTL_SECONDS = 7200;

    /** 数据表名（不含前缀） */
    protected $name = 'admin_session';

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
        'id'       => 'integer',
        'admin_id' => 'integer',
        'token'    => 'string',
        'ip'       => 'string',
    ];

    /**
     * 按 Token 查询**未过期**会话
     * @param string $token 会话 Token
     * @return AdminSession|null 命中返回模型，否则 null（不存在或已过期）
     */
    public static function findValid(string $token): ?AdminSession
    {
        if ($token === '') {
            return null;
        }

        /** @var AdminSession|null $session */
        $session = self::where('token', $token)
            ->where('expires_at', '>', date('Y-m-d H:i:s'))
            ->find();

        return $session instanceof AdminSession ? $session : null;
    }

    /**
     * 为指定管理员签发新 Token 并落库
     * @param int    $adminId  管理员 ID
     * @param string $ip       签发 IP
     * @param string $userAgent 签发 UA
     * @return AdminSession 已落库的会话记录（含 token / expires_at）
     */
    public static function issue(int $adminId, string $ip = '', string $userAgent = ''): AdminSession
    {
        $now    = time();
        $token  = bin2hex(random_bytes(32));
        $expire = date('Y-m-d H:i:s', $now + self::TTL_SECONDS);

        /** @var AdminSession $session */
        $session = self::create([
            'admin_id'   => $adminId,
            'token'      => $token,
            'expires_at' => $expire,
            'ip'         => mb_substr($ip, 0, 45),
            'user_agent' => mb_substr($userAgent, 0, 255),
        ]);

        return $session;
    }

    /**
     * 作废单个 Token（登出）
     * @param string $token 待作废 Token
     * @return int 受影响行数
     */
    public static function revoke(string $token): int
    {
        if ($token === '') {
            return 0;
        }

        return (int) self::where('token', $token)->delete();
    }

    /**
     * 作废某管理员的全部会话（改密后强制所有端重新登录）
     * @param int $adminId 管理员 ID
     * @return int 受影响行数
     */
    public static function revokeAll(int $adminId): int
    {
        return (int) self::where('admin_id', $adminId)->delete();
    }

    /**
     * 清理已过期会话（可选的定时任务调用）
     * @return int 受影响行数
     */
    public static function purgeExpired(): int
    {
        return (int) self::where('expires_at', '<=', date('Y-m-d H:i:s'))->delete();
    }
}
