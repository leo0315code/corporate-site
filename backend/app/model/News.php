<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 新闻模型（对应 news 表）
 *
 * 字段与 `frontend/src/types/index.ts` 的 `NewsItem` 完全一致；
 * `content` 保留原始 `\n` 分段，前台按换行渲染。
 *
 * @property string $id
 * @property string $title
 * @property string $date
 * @property string $category
 * @property string $cover
 * @property string $summary
 * @property string $content
 * @property string $created_at
 * @property string $updated_at
 */
class News extends Model
{
    /** 数据表名（不含前缀） */
    protected $name = 'news';

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
     * 说明：`date` 为 DATE 列，读取时统一格式化为 YYYY-MM-DD。
     * @var array<string, string>
     */
    protected $type = [
        'id'       => 'string',
        'title'    => 'string',
        'date'     => 'string',
        'category' => 'string',
        'cover'    => 'string',
        'summary'  => 'string',
    ];
}
