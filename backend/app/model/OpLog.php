<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 操作日志模型（对应 op_log 表，只增不改）
 *
 * 设计要点：
 * - 无 `updated_at`（审计流水只追加，不修改），故 `$updateTime = false`；
 * - `created_at` 为服务端时间（写入器显式传入，或由自动时间戳兜底）；
 * - `toLogItem()` 字段名与前端 `OpLogItem` 逐字段对齐，数字字段转 int。
 *
 * @property int    $id
 * @property int    $admin_id
 * @property string $admin_name
 * @property string $created_at
 * @property string $module
 * @property string $action
 * @property string $target
 * @property string $target_name
 * @property string $ip
 * @property string $user_agent
 * @property int    $result
 * @property string $detail
 */
class OpLog extends Model
{
    /** 数据表名（不含前缀） */
    protected $name = 'op_log';

    /** 主键 */
    protected $pk = 'id';

    /** 只写 created_at（服务端时间），无 updated_at */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = false;

    /**
     * 字段类型转换
     * @var array<string, string>
     */
    protected $type = [
        'id'         => 'integer',
        'admin_id'   => 'integer',
        'result'     => 'integer',
        'created_at' => 'string',
    ];

    /**
     * 列表 / 详情项（字段名与前端 `OpLogItem` 完全一致，数字字段转 int）
     * @return array<string, mixed>
     */
    public function toLogItem(): array
    {
        return [
            'id'          => (int) $this->id,
            'admin_id'    => (int) $this->admin_id,
            'admin_name'  => (string) $this->admin_name,
            'created_at'  => (string) $this->created_at,
            'module'      => (string) $this->module,
            'action'      => (string) $this->action,
            'target'      => (string) $this->target,
            'target_name' => (string) $this->target_name,
            'ip'          => (string) $this->ip,
            'user_agent'  => (string) $this->user_agent,
            'result'      => (int) $this->result,
            'detail'      => (string) $this->detail,
        ];
    }
}
