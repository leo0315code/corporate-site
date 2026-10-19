<?php
declare(strict_types=1);

namespace app\validate;

use think\Validate;

/**
 * 内容验证器（产品 / 新闻 / 案例 / 优势 / 关于我们）
 *
 * 按类型分场景（scene）：`product` / `news` / `case` / `advantage` / `about`。
 * 规则依据 `docs/PRD-CMS.md` 第七节字段表与 `docs/ARCHITECTURE-CMS.md` 第四节类型定义。
 *
 * 实现说明：场景采用 **关联数组（字段 => 规则）** 覆盖写法，使不同类型可对
 * 同名字段设置不同规则（例如 `product.summary ≤200` 而 `news.summary ≤300`），
 * 且可让 `id` 在产品/新闻/案例场景必填、在优势场景可选。
 *
 * 字段名与 `frontend/src/types/index.ts` 完全一致（多词字段统一 snake_case）。
 * 复杂数组（features / values / timeline / abilities）的**深层结构**在 ContentService
 * 内二次归一化与截断校验；本验证器负责必填、类型与标量长度。
 */
class ContentValidate extends Validate
{
    /**
     * 基础规则（供 `scene` 关联数组引用为默认值）
     * @var array<string, string>
     */
    protected $rule = [
        'id'          => 'length:1,80',
        'category'    => 'max:30',
        'name'        => 'max:60',
        'summary'     => 'max:300',
        'description' => 'max:20000',
        'features'    => 'array',
        'image'       => 'max:255',
        'icon'        => 'max:30',
        'title'       => 'max:100',
        'date'        => 'checkDate',
        'cover'       => 'max:255',
        'content'     => 'max:20000',
        'logo'        => 'max:255',
        'desc'        => 'max:200',
        'value'       => 'max:20',
        'label'       => 'max:30',
        'sort_order'  => 'integer',
        'intro'       => 'max:20000',
        'vision'      => 'max:200',
        'mission'     => 'max:200',
        'values'      => 'array',
        'timeline'    => 'array',
        'abilities'   => 'array',
        // —— 网站配置（site_config）——
        // **字段名与 `ContentService::normalizeSiteConfig()` 的输出（扁平 snake_case）一致**，
        // 因为 `saveSiteConfig()` 是「先归一化、再校验」。若此处写成 camelCase，
        // 校验会因键名不匹配而永远失败。
        // 注意：`description` 已在上面定义为 max:20000（产品/新闻详情用），
        // 网站配置的 500 字上限在下方 `site` 场景内单独覆盖，避免键冲突。
        'company_name' => 'max:50',
        'slogan'       => 'max:100',
        'phone'        => 'max:50',
        'email'        => 'max:100',
        'address'      => 'max:200',
        'work_time'    => 'max:100',
        'map_image'    => 'max:255',
        'copyright'    => 'max:200',
        'icp'          => 'max:100',
        'socials'      => 'array',
        'seo_title'    => 'max:200',
        'seo_desc'     => 'max:500',
        'seo_keywords' => 'max:500',
    ];

    /**
     * 错误提示
     * @var array<string, string>
     */
    protected $message = [
        'id.require'          => '请填写唯一标识 id',
        'id.length'           => '唯一标识 id 长度需为 1~80 个字符',
        'id.integer'          => 'id 需为整数',
        'category.require'    => '请填写分类',
        'category.max'        => '分类不得超过 30 个字符',
        'name.require'        => '请填写名称',
        'name.max'            => '名称不得超过 60 个字符',
        'summary.require'     => '请填写简介/摘要',
        'summary.max'         => '简介/摘要长度超出上限',
        'features.array'      => '特点需为列表',
        'description.require' => '请填写详情',
        'description.max'     => '简介/详情长度超出上限',
        'image.max'           => '图片路径不得超过 255 个字符',
        'icon.max'            => '图标标识不得超过 30 个字符',
        'title.require'       => '请填写标题',
        'title.max'           => '标题不得超过 100 个字符',
        'date.require'        => '请填写日期',
        'date.checkDate'      => '日期格式需为 YYYY-MM-DD',
        'cover.max'           => '封面路径不得超过 255 个字符',
        'content.require'     => '请填写正文',
        'content.max'         => '正文长度超出上限',
        'logo.max'            => 'Logo 路径不得超过 255 个字符',
        'desc.require'        => '请填写描述',
        'desc.max'            => '描述不得超过 200 个字符',
        'value.require'       => '请填写展示数值',
        'value.max'           => '展示数值不得超过 20 个字符',
        'label.require'       => '请填写标签',
        'label.max'           => '标签不得超过 30 个字符',
        'sort_order.integer'  => '排序值需为整数',
        'intro.require'       => '请填写公司简介',
        'intro.max'           => '公司简介长度超出上限',
        'vision.require'      => '请填写愿景',
        'vision.max'          => '愿景不得超过 200 个字符',
        'mission.require'     => '请填写使命',
        'mission.max'         => '使命不得超过 200 个字符',
        'values.array'        => '价值观需为列表',
        'timeline.array'      => '发展历程需为列表',
        'abilities.array'     => '能力资质需为列表',
        'company_name.require' => '请填写公司名称',
        'company_name.max'     => '公司名称不得超过 50 个字符',
        'slogan.max'           => '标语不得超过 100 个字符',
        'phone.max'            => '联系电话不得超过 50 个字符',
        'email.max'            => '联系邮箱不得超过 100 个字符',
        'address.max'          => '联系地址不得超过 200 个字符',
        'work_time.max'        => '工作时间不得超过 100 个字符',
        'map_image.max'        => '地图图片路径不得超过 255 个字符',
        'copyright.max'        => '版权文案不得超过 200 个字符',
        'icp.max'              => '备案号不得超过 100 个字符',
        'socials.array'        => '社交链接需为列表',
        'seo_title.max'        => 'SEO 标题不得超过 200 个字符',
        'seo_desc.max'         => 'SEO 描述不得超过 500 个字符',
        'seo_keywords.max'     => 'SEO 关键词不得超过 500 个字符',
    ];

    /**
     * 校验场景（关联数组：字段 => 规则，逐类型精确控制）
     * @var array<string, array<string, string>>
     */
    protected $scene = [
        // 产品/服务：id 为业务 slug 必填
        'product'   => [
            'id'          => 'require|length:1,80',
            'category'    => 'require|max:30',
            'name'        => 'require|max:60',
            'summary'     => 'require|max:200',
            'description' => 'require|max:20000',
            'features'    => 'array',
            'image'       => 'max:255',
            'icon'        => 'max:30',
        ],
        // 新闻：summary ≤300，含 date 严格校验
        'news'      => [
            'id'       => 'require|length:1,80',
            'title'    => 'require|max:100',
            'date'     => 'require|checkDate',
            'category' => 'require|max:30',
            'cover'    => 'max:255',
            'summary'  => 'require|max:300',
            'content'  => 'require|max:20000',
        ],
        // 客户案例
        'case'      => [
            'id'   => 'require|length:1,80',
            'name' => 'require|max:50',
            'logo' => 'max:255',
            'desc' => 'require|max:200',
        ],
        // 优势：id 为自增主键（可选），命中则视为编辑
        'advantage' => [
            'id'         => 'integer',
            'value'      => 'require|max:20',
            'label'      => 'require|max:30',
            'desc'       => 'max:100',
            'sort_order' => 'integer',
        ],
        // 关于我们（单例整页）
        'about'     => [
            'intro'     => 'require|max:20000',
            'vision'    => 'require|max:200',
            'mission'   => 'require|max:200',
            'values'    => 'array',
            'timeline'  => 'array',
            'abilities' => 'array',
        ],
        // 网站配置（单例整页）：公司名称为唯一必填项，其余可留空
        // 字段名为 normalizeSiteConfig() 输出的扁平 snake_case（先归一化、再校验）
        'site'      => [
            'company_name' => 'require|max:50',
            'slogan'       => 'max:100',
            'description'  => 'max:500',
            'phone'        => 'max:50',
            'email'        => 'max:100',
            'address'      => 'max:200',
            'work_time'    => 'max:100',
            'logo'         => 'max:255',
            'map_image'    => 'max:255',
            'copyright'    => 'max:200',
            'icp'          => 'max:100',
            'socials'      => 'array',
            'seo_title'    => 'max:200',
            'seo_desc'     => 'max:500',
            'seo_keywords' => 'max:500',
        ],
    ];

    /**
     * 强制校验字段（即使为空字符串也执行对应规则）
     *
     * 背景（与 MessageValidate 一致）：TP8 对空字符串会跳过非 require 的自定义规则。
     * 新闻 `date` 采用自定义规则 `checkDate`，列入 `$must` 以确保空值也被拦截。
     * @var array<int, string>
     */
    protected $must = ['date'];

    /**
     * 日期格式校验（严格 YYYY-MM-DD）
     * @param mixed $value 日期值
     * @return bool
     */
    protected function checkDate(mixed $value): bool
    {
        $date = trim((string) $value);

        if ($date === '') {
            return false;
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) !== 1) {
            return false;
        }

        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }
}
