<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 留言模型（对应 message 表）
 *
 * @property int         $id
 * @property string      $name
 * @property string|null $company
 * @property string      $phone
 * @property string      $email
 * @property string      $content
 * @property string      $ip
 * @property int         $status     处理状态：0=待处理 1=已处理（CMS 新增列）
 * @property string|null $handled_at 处理时间（CMS 新增列）
 * @property string      $created_at
 */
class Message extends Model
{
    /** 处理状态：待处理 */
    public const STATUS_PENDING = 0;

    /** 处理状态：已处理 */
    public const STATUS_HANDLED = 1;

    /** 数据表名（不含前缀） */
    protected $name = 'message';

    /** 主键 */
    protected $pk = 'id';

    /** 自动写入创建时间（字段 created_at），不写更新时间 */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    /**
     * 字段类型转换
     * 说明：company 不做类型转换，保持 NULL / 空字符串原样入库
     * @var array<string, string>
     */
    protected $type = [
        'id'      => 'integer',
        'name'    => 'string',
        'phone'   => 'string',
        'email'   => 'string',
        'content' => 'string',
        'ip'      => 'string',
        'status'  => 'integer',
    ];

    /**
     * 查询 60 秒内同 IP + 同内容的重复留言
     * @param string $ip 提交者 IP
     * @param string $content 留言内容
     * @param int    $seconds 时间窗口（秒），默认 60
     * @return Message|null 命中则返回记录，否则返回 null
     */
    public static function findDuplicate(string $ip, string $content, int $seconds = 60): ?Message
    {
        $threshold = date('Y-m-d H:i:s', time() - $seconds);

        /** @var Message|null $record */
        $record = self::where('ip', $ip)
            ->where('content', $content)
            ->where('created_at', '>', $threshold)
            ->order('id', 'desc')
            ->find();

        return $record instanceof Message ? $record : null;
    }

    /**
     * 创建留言记录（仅写入白名单字段，防批量赋值）
     * @param array<string, mixed> $data 留言数据
     * @return Message
     */
    public static function createMessage(array $data): Message
    {
        $allow = ['name', 'company', 'phone', 'email', 'content', 'ip'];
        $payload = array_intersect_key($data, array_flip($allow));

        /** @var Message $model */
        $model = self::create($payload);
        return $model;
    }

    /**
     * 标记留言处理状态（0=待处理，1=已处理），并维护 handled_at
     *
     * 语义：置为「已处理」写入处理时间；回退为「待处理」清空处理时间。
     *
     * @param int $id     留言 ID
     * @param int $status 目标状态（0 或 1）
     * @return bool 命中并更新返回 true；记录不存在返回 false
     */
    public static function markStatus(int $id, int $status): bool
    {
        /** @var Message|null $row */
        $row = self::find($id);
        if (!$row instanceof Message) {
            return false;
        }

        $row->status     = $status === self::STATUS_HANDLED ? self::STATUS_HANDLED : self::STATUS_PENDING;
        $row->handled_at = $row->status === self::STATUS_HANDLED ? date('Y-m-d H:i:s') : null;
        $row->save();

        return true;
    }
}
