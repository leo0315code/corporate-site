<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 产品 / 服务模型（对应 product 表）
 *
 * 字段与 `frontend/src/types/index.ts` 的 `Product` 完全一致；
 * `features` 为 JSON 字段，由 ORM 自动编解码为 string[]。
 *
 * @property string      $id
 * @property string      $category
 * @property string      $name
 * @property string      $summary
 * @property string      $description
 * @property string[]    $features
 * @property string      $image
 * @property string      $icon
 * @property string      $created_at
 * @property string      $updated_at
 */
class Product extends Model
{
    /** 数据表名（不含前缀） */
    protected $name = 'product';

    /** 主键为业务 slug（非自增） */
    protected $pk = 'id';

    /** 主键非自增 */
    protected $autoInc = false;

    /** 自动写入时间戳（datetime 类型） */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    /**
     * JSON 字段（自动编解码为数组）
     * @var array<int, string>
     */
    protected $json = ['features'];

    /**
     * JSON 字段解码为关联数组
     * @var bool
     */
    protected $jsonAssoc = true;

    /**
     * 字段类型转换
     * @var array<string, string>
     */
    protected $type = [
        'id'       => 'string',
        'category' => 'string',
        'name'     => 'string',
        'summary'  => 'string',
        'image'    => 'string',
        'icon'     => 'string',
    ];
}
