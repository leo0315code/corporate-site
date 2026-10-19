<?php
declare(strict_types=1);

namespace app\service\content;

use app\model\Advantage;
use app\model\CaseItem;
use app\model\News;
use app\model\Product;
use think\Model;

/**
 * 内容域元数据（类型 → 模型 / 字段白名单 / 排序 / 日志字段）
 *
 * 拆出原因：这些常量被「后台 CRUD」「前台只读」「单例（关于我们/网站配置）」三类
 * 服务共用，放在任一 Service 内都会让另外两个反向依赖它。集中到不可变常量的
 * Schema 后，各服务只依赖本类，依赖方向单一。
 *
 * 约定：字段名与 `frontend/src/types/index.ts` **逐字段对齐**，改动需同步前端。
 */
final class ContentSchema
{
    /**
     * 类型 → 模型类映射
     * @var array<string, class-string<Model>>
     */
    public const MODEL_MAP = [
        'product'   => Product::class,
        'news'      => News::class,
        'case'      => CaseItem::class,
        'advantage' => Advantage::class,
    ];

    /**
     * 类型 → 可搜索字段
     * @var array<string, string[]>
     */
    public const SEARCH_FIELDS = [
        'product'   => ['name', 'summary'],
        'news'      => ['title', 'summary'],
        'case'      => ['name', 'desc'],
        'advantage' => ['value', 'label', 'desc'],
    ];

    /**
     * 类型 → 写入白名单字段
     * @var array<string, string[]>
     */
    public const SAVE_FIELDS = [
        'product'   => ['id', 'category', 'name', 'summary', 'description', 'features', 'image', 'icon'],
        'news'      => ['id', 'title', 'date', 'category', 'cover', 'summary', 'content'],
        'case'      => ['id', 'name', 'logo', 'desc'],
        'advantage' => ['value', 'label', 'desc', 'sort_order'],
    ];

    /**
     * 类型 → 排序规则（配合种子导入的 created_at 规则保持源文件顺序）
     *
     * news 以 `date` 为主序，追加 `created_at` 作确定性次序（同日多篇时稳定），
     * 并使列表与详情导航排序完全一致。
     * @var array<string, array<string, string>>
     */
    public const ORDER_MAP = [
        'product'   => ['created_at' => 'desc'],
        'news'      => ['date' => 'desc', 'created_at' => 'desc'],
        'case'      => ['created_at' => 'desc'],
        'advantage' => ['sort_order' => 'asc', 'id' => 'asc'],
    ];

    /**
     * 支持的内容类型
     * @var string[]
     */
    public const TYPES = ['product', 'news', 'case', 'advantage'];

    /**
     * 内容类型 → 摘要文案中的名称标签（用于操作日志 `detail`）
     * @var array<string, string>
     */
    public const NAME_LABEL = [
        'product'   => '名称',
        'news'      => '标题',
        'case'      => '名称',
        'advantage' => '标签',
    ];

    /**
     * 关于我们：参与「变更字段」对比的字段白名单（用于操作日志 detail）
     * @var string[]
     */
    public const ABOUT_LOG_FIELDS = ['intro', 'vision', 'mission', 'values', 'timeline', 'abilities'];

    /**
     * 网站配置：参与「变更字段」对比的字段白名单（用于操作日志 detail）
     * @var string[]
     */
    public const SITE_LOG_FIELDS = [
        'company_name', 'logo', 'slogan', 'description',
        'phone', 'email', 'address', 'work_time', 'map_image',
        'copyright', 'icp', 'socials',
        'seo_title', 'seo_desc', 'seo_keywords',
    ];

    /**
     * 类型 → 对外（前台公开 API）暴露字段白名单
     *
     * **剔除** created_at/updated_at/sort_order 等仅后台使用的字段；
     * advantage 额外暴露自增 `id`（`AdvantageItem` 契约）。
     * @var array<string, string[]>
     */
    public const PUBLIC_FIELDS = [
        'product'   => ['id', 'category', 'name', 'summary', 'description', 'features', 'image', 'icon'],
        'news'      => ['id', 'title', 'date', 'category', 'cover', 'summary', 'content'],
        'case'      => ['id', 'name', 'logo', 'desc'],
        'advantage' => ['id', 'value', 'label', 'desc'],
    ];
}
