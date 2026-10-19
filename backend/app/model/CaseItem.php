<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 客户案例模型（对应 case_item 表）
 *
 * 表名刻意用 `case_item` 以避开 MySQL 保留字 `CASE`。
 * 字段与 `frontend/src/types/index.ts` 的 `CaseItem` 完全一致（id/name/logo/desc）。
 *
 * @property string $id
 * @property string $name
 * @property string $logo
 * @property string $desc
 * @property string $created_at
 * @property string $updated_at
 */
class CaseItem extends Model
{
    /** 数据表名（不含前缀，避开保留字 case） */
    protected $name = 'case_item';

    /** 主键为业务 slug（非自增） */
    protected $pk = 'id';

    /** 主键非自增 */
    protected $autoInc = false;

    /** 自动写入时间戳（datetime 类型） */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    /**
     * 字段类型转换
     * @var array<string, string>
     */
    protected $type = [
        'id'   => 'string',
        'name' => 'string',
        'logo' => 'string',
        'desc' => 'string',
    ];
}
