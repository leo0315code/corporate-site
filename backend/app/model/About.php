<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 关于我们模型（对应 about 表，**单例**，恒 1 行）
 *
 * 复杂结构 `values` / `timeline` / `abilities` 以 MySQL JSON 存储，由 ORM 自动编解码。
 * 注意：本表只有 `updated_at`，**没有** `created_at`，故 `$createTime = false`。
 *
 * @property int                                    $id
 * @property string                                 $intro
 * @property string                                 $vision
 * @property string                                 $mission
 * @property string[]                               $values
 * @property array<int, array{year:string,title:string,desc:string}> $timeline
 * @property array<int, array{title:string,desc:string}>             $abilities
 * @property string                                 $updated_at
 */
class About extends Model
{
    /** 单例行固定主键值 */
    public const SINGLETON_ID = 1;

    /** 数据表名（不含前缀） */
    protected $name = 'about';

    /** 主键 */
    protected $pk = 'id';

    /** 主键非自增（单例固定 id=1） */
    protected $autoInc = false;

    /** 自动写入时间戳（datetime 类型）：仅写 updated_at */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = false;
    protected $updateTime = 'updated_at';

    /**
     * JSON 字段（自动编解码为数组）
     * @var array<int, string>
     */
    protected $json = ['values', 'timeline', 'abilities'];

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
        'id'      => 'integer',
        'intro'   => 'string',
        'vision'  => 'string',
        'mission' => 'string',
    ];

    /**
     * 获取单例记录；不存在则返回 null
     * @return About|null
     */
    public static function singleton(): ?About
    {
        /** @var About|null $row */
        $row = self::find(self::SINGLETON_ID);
        return $row instanceof About ? $row : null;
    }

    /**
     * 转为前端 `AboutData` 结构（仅业务字段，不含 id/updated_at）
     * @return array<string, mixed>
     */
    public function toAboutData(): array
    {
        return [
            'intro'     => (string) $this->intro,
            'vision'    => (string) $this->vision,
            'mission'   => (string) $this->mission,
            'values'    => is_array($this->values) ? $this->values : [],
            'timeline'  => is_array($this->timeline) ? $this->timeline : [],
            'abilities' => is_array($this->abilities) ? $this->abilities : [],
        ];
    }
}
