<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 网站配置模型（对应 `site_config` 表，**单例**，恒 1 行）
 *
 * 设计要点：
 * - 表结构为**扁平 snake_case**（便于 DBA 维护），而对外 API 契约沿用前端既有的
 *   **嵌套 camelCase** 结构（`contact` / `footer` / `seo`），由 `toSiteConfig()` 转换。
 *   这样前端 `SiteConfig` 类型与消费方无需改动结构，只把「静态 import」换成「接口读取」。
 * - `socials` 为结构化列表，用 MySQL JSON 存储（ORM 自动编解码）。
 * - **不落库**的部分：`nav`（导航菜单，配错路径会导致前台 404）、`theme`（主题色，受
 *   构建期 Tailwind 编译约束）、`footer.quickLinks`（与 `nav` 同源）。这些由前端静态配置补齐。
 * - 本表只有 `updated_at`，**没有** `created_at`，故 `$createTime = false`（与 About 一致）。
 *
 * @property int    $id
 * @property string $company_name
 * @property string $logo
 * @property string $slogan
 * @property string $description
 * @property string $phone
 * @property string $email
 * @property string $address
 * @property string $work_time
 * @property string $map_image
 * @property string $copyright
 * @property string $icp
 * @property array<int, array{label:string,url:string,icon:string}> $socials
 * @property string $seo_title
 * @property string $seo_desc
 * @property string $seo_keywords
 * @property string $updated_at
 */
class SiteConfig extends Model
{
    /** 单例行固定主键值 */
    public const SINGLETON_ID = 1;

    /** 数据表名（不含前缀） */
    protected $name = 'site_config';

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
    protected $json = ['socials'];

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
        'id' => 'integer',
    ];

    /**
     * 获取单例记录；不存在则返回 null
     * @return SiteConfig|null
     */
    public static function singleton(): ?SiteConfig
    {
        /** @var SiteConfig|null $row */
        $row = self::find(self::SINGLETON_ID);

        return $row instanceof SiteConfig ? $row : null;
    }

    /**
     * 转为前端 `SiteConfigData` 结构（嵌套 camelCase，仅业务字段）
     *
     * **注意**：故意**不含** `nav` / `theme` / `footer.quickLinks` —— 这三项由前端静态配置提供，
     * 前端 Provider 会把它们与本返回值合并成完整的 `SiteConfig`。
     *
     * @return array<string, mixed>
     */
    public function toSiteConfig(): array
    {
        return [
            'companyName' => (string) $this->company_name,
            'logo'        => (string) $this->logo,
            'slogan'      => (string) $this->slogan,
            'description' => (string) $this->description,
            'contact'     => [
                'phone'    => (string) $this->phone,
                'email'    => (string) $this->email,
                'address'  => (string) $this->address,
                'workTime' => (string) $this->work_time,
                'mapImage' => (string) $this->map_image,
            ],
            'footer' => [
                'copyright' => (string) $this->copyright,
                'icp'       => (string) $this->icp,
                'socials'   => $this->normalizedSocials(),
            ],
            'seo' => [
                'title'       => (string) $this->seo_title,
                'description' => (string) $this->seo_desc,
                'keywords'    => (string) $this->seo_keywords,
            ],
        ];
    }

    /**
     * 规范化社交链接列表（保证结构稳定、字段为字符串）
     * @return array<int, array{label:string,url:string,icon:string}>
     */
    public function normalizedSocials(): array
    {
        if (!is_array($this->socials)) {
            return [];
        }

        $result = [];
        foreach ($this->socials as $item) {
            if (!is_array($item)) {
                continue;
            }
            $label = trim((string) ($item['label'] ?? ''));
            if ($label === '') {
                continue;
            }
            $result[] = [
                'label' => $label,
                'url'   => trim((string) ($item['url'] ?? '')),
                'icon'  => trim((string) ($item['icon'] ?? '')),
            ];
        }

        return $result;
    }
}
