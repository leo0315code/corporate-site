<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 首页「数据与优势」模型（对应 advantage 表）
 *
 * 前端 `Advantage` 类型无 `id`，故表用自增主键作为后台操作标识；
 * API 返回时会附带 `id` 字段（前台渲染忽略）。
 *
 * @property int    $id
 * @property string $value
 * @property string $label
 * @property string $desc
 * @property int    $sort_order
 * @property string $created_at
 * @property string $updated_at
 */
class Advantage extends Model
{
    /** 数据表名（不含前缀） */
    protected $name = 'advantage';

    /** 主键（自增） */
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
        'value'      => 'string',
        'label'      => 'string',
        'desc'       => 'string',
        'sort_order' => 'integer',
    ];
}
