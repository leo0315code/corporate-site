<?php
declare(strict_types=1);

namespace app\service;

use app\model\About;
use app\model\Advantage;
use app\model\CaseItem;
use app\model\News;
use app\model\Product;
use app\model\SiteConfig;
use app\validate\ContentValidate;
use think\facade\Log;
use think\Model;
use think\Response;

/**
 * 内容业务服务（产品 / 新闻 / 案例 / 优势 / 关于我们）
 *
 * 统一按「类型」编排四类内容的列表（分页 + 关键词 + 分类）、保存（新增 / 编辑）、
 * 详情、删除，以及关于我们（单例）整页读写。
 *
 * 安全/一致性：
 * - 全部经 ORM / 参数绑定，**禁止字符串拼接 SQL**；
 * - 字段白名单，防批量赋值；
 * - 字段名与 `frontend/src/types/index.ts` 完全一致；
 * - `advantage` 返回附带 `id`（自增主键，供后台操作标识，前台忽略）。
 */
class ContentService
{
    /**
     * 类型 → 模型类映射
     * @var array<string, class-string<Model>>
     */
    protected const MODEL_MAP = [
        'product'   => Product::class,
        'news'      => News::class,
        'case'      => CaseItem::class,
        'advantage' => Advantage::class,
    ];

    /**
     * 类型 → 可搜索字段
     * @var array<string, string[]>
     */
    protected const SEARCH_FIELDS = [
        'product'   => ['name', 'summary'],
        'news'      => ['title', 'summary'],
        'case'      => ['name', 'desc'],
        'advantage' => ['value', 'label', 'desc'],
    ];

    /**
     * 类型 → 写入白名单字段
     * @var array<string, string[]>
     */
    protected const SAVE_FIELDS = [
        'product'   => ['id', 'category', 'name', 'summary', 'description', 'features', 'image', 'icon'],
        'news'      => ['id', 'title', 'date', 'category', 'cover', 'summary', 'content'],
        'case'      => ['id', 'name', 'logo', 'desc'],
        'advantage' => ['value', 'label', 'desc', 'sort_order'],
    ];

    /**
     * 类型 → 排序规则（配合种子导入的 created_at 规则保持源文件顺序）
     *
     * 说明：news 以 `date` 为主序，追加 `created_at` 作确定性次序（同日多篇时稳定），
     * 不影响既有数据（种子日期互不相同），并使列表与详情导航排序完全一致。
     * @var array<string, array<string, string>>
     */
    protected const ORDER_MAP = [
        'product'   => ['created_at' => 'desc'],
        'news'      => ['date' => 'desc', 'created_at' => 'desc'],
        'case'      => ['created_at' => 'desc'],
        'advantage' => ['sort_order' => 'asc', 'id' => 'asc'],
    ];

    /**
     * 支持的内容类型
     * @var string[]
     */
    protected const TYPES = ['product', 'news', 'case', 'advantage'];

    /**
     * 内容类型 → 摘要文案中的名称标签（用于操作日志 `detail`）
     * @var array<string, string>
     */
    protected const NAME_LABEL = [
        'product'   => '名称',
        'news'      => '标题',
        'case'      => '名称',
        'advantage' => '标签',
    ];

    /**
     * 关于我们：参与「变更字段」对比的字段白名单（用于操作日志 detail）
     * @var string[]
     */
    protected const ABOUT_LOG_FIELDS = ['intro', 'vision', 'mission', 'values', 'timeline', 'abilities'];

    /**
     * 网站配置：参与「变更字段」对比的字段白名单（用于操作日志 detail）
     * @var string[]
     */
    protected const SITE_LOG_FIELDS = [
        'company_name', 'logo', 'slogan', 'description',
        'phone', 'email', 'address', 'work_time', 'map_image',
        'copyright', 'icp', 'socials',
        'seo_title', 'seo_desc', 'seo_keywords',
    ];

    /**
     * 类型 → 对外（前台公开 API）暴露字段白名单
     *
     * 与 `frontend/src/types/index.ts` 逐字段对齐；**剔除** created_at/updated_at/sort_order 等
     * 仅后台使用的字段。advantage 额外暴露自增 `id`（`AdvantageItem` 契约）。
     * @var array<string, string[]>
     */
    public const PUBLIC_FIELDS = [
        'product'   => ['id', 'category', 'name', 'summary', 'description', 'features', 'image', 'icon'],
        'news'      => ['id', 'title', 'date', 'category', 'cover', 'summary', 'content'],
        'case'      => ['id', 'name', 'logo', 'desc'],
        'advantage' => ['id', 'value', 'label', 'desc'],
    ];

    /**
     * 内容列表（分页 + 关键词搜索 + 分类筛选）
     * @param string $type     内容类型（product|news|case|advantage）
     * @param int    $page     页码（>=1）
     * @param int    $size     每页条数（1~50）
     * @param string $keyword  关键词（模糊匹配搜索字段）
     * @param string $category 分类（仅 product/news 有效）
     * @return Response 统一响应，data = {total,page,size,items}
     */
    public function list(string $type, int $page, int $size, string $keyword = '', string $category = ''): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        $page = $page < 1 ? 1 : $page;
        $size = $size < 1 ? 10 : min($size, 50);

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            $query = $model::query();

            // 关键词搜索（多字段 OR，ORM 参数绑定）
            $keyword = trim($keyword);
            if ($keyword !== '') {
                $fields   = self::SEARCH_FIELDS[$type];
                $likeValue = '%' . $keyword . '%';
                $query->where(function ($q) use ($fields, $likeValue) {
                    foreach ($fields as $i => $field) {
                        if ($i === 0) {
                            $q->whereLike($field, $likeValue);
                        } else {
                            $q->whereOr($field, 'like', $likeValue);
                        }
                    }
                });
            }

            // 分类筛选（仅产品/新闻）
            $category = trim($category);
            if ($category !== '' && in_array('category', self::SAVE_FIELDS[$type], true)) {
                $query->where('category', $category);
            }

            // 排序
            foreach (self::ORDER_MAP[$type] as $field => $dir) {
                $query->order($field, $dir);
            }

            $total = (clone $query)->count();
            $items = $query->page($page, $size)->select()->toArray();

            return success([
                'total' => (int) $total,
                'page'  => $page,
                'size'  => $size,
                'items' => $items,
            ]);
        } catch (\Throwable $e) {
            Log::error("[cms:content] 列表查询失败 type={$type}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 内容详情（按主键）
     * @param string     $type 内容类型
     * @param string|int $id   主键
     * @return Response 未命中 → 4004
     */
    public function detail(string $type, string|int $id): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            /** @var Model|null $row */
            $row = $model::find($id);
            if ($row === null) {
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            return success($row->toArray());
        } catch (\Throwable $e) {
            Log::error("[cms:content] 详情查询失败 type={$type} id={$id}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 保存内容（新增或编辑）
     *
     * 语义：
     * - product / news / case（业务 slug 主键）：payload `_editing=true` 视为编辑；否则视为新增，
     *   新增时若 id 已存在 → **1001**（提示 id 已存在）；
     * - advantage（INT 自增主键）：携带 id 视为编辑，否则新增。
     *
     * 埋点（C-P1-3）：在所有「状态被改变」的出口记录操作日志；无变化（幂等）不记，避免噪声。
     *
     * @param string               $type 内容类型
     * @param array<string, mixed> $data 请求数据（原始）
     * @param OpLogContext|null    $ctx  操作日志上下文（null=CLI/未知）
     * @return Response data = 保存后的实体
     */
    public function save(string $type, array $data, ?OpLogContext $ctx = null): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        // 意图 action（在 normalize/validate 之前判定，供校验失败分支记录）
        $isEdit = $type === 'advantage'
            ? ((int) ($data['id'] ?? 0)) > 0
            : (bool) ($data['_editing'] ?? false);

        // 归一化（白名单 + 结构化字段处理）
        $normalized = $this->normalize($type, $data);

        // 服务端校验（最终裁决）
        $validate = new ContentValidate();
        if (!$validate->scene($type)->check($normalized)) {
            OpLogService::record(
                $type,
                $isEdit ? 'update' : 'create',
                0,
                '校验失败：' . $validate->getError(),
                $this->targetOf($type, $data, $normalized),
                '',
                $ctx
            );
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            if ($type === 'advantage') {
                // 自增主键：有 id 则编辑，无则新增
                $id = (int) ($data['id'] ?? 0);
                if ($id > 0) {
                    /** @var Model|null $row */
                    $row = $model::find($id);
                    if ($row === null) {
                        OpLogService::record($type, 'update', 0, '编辑失败：资源不存在', (string) $id, '', $ctx);
                        return fail(error_code()['NOT_FOUND'], '资源不存在');
                    }
                    $before = $row->toArray();
                    $row->save($normalized);
                    $after = $model::find($id)->toArray();
                    $this->recordSave($type, $before, $after, (string) $id, $ctx);

                    return success($after);
                }

                /** @var Model $row */
                $row = $model::create($normalized);
                $newId = (int) $row->getKey();
                $after = $model::find($newId)->toArray();
                $name  = $this->targetNameOf($type, $after);
                OpLogService::record(
                    $type,
                    'create',
                    1,
                    '新增：' . self::NAME_LABEL[$type] . '=' . $name,
                    (string) $newId,
                    $name,
                    $ctx
                );

                return success($after);
            }

            // slug 主键类型：新增 / 编辑判定
            $id     = (string) $normalized['id'];
            /** @var Model|null $exists */
            $exists = $model::find($id);

            if ($isEdit) {
                if ($exists === null) {
                    // 编辑目标不存在：按新增处理（幂等 upsert 语义）
                    $model::create($normalized);
                    $after = $model::find($id)->toArray();
                    $name  = $this->targetNameOf($type, $after);
                    OpLogService::record(
                        $type,
                        'create',
                        1,
                        '新增：' . self::NAME_LABEL[$type] . '=' . $name,
                        $id,
                        $name,
                        $ctx
                    );
                } else {
                    $before = $exists->toArray();
                    $exists->save($normalized);
                    $after = $model::find($id)->toArray();
                    $this->recordSave($type, $before, $after, $id, $ctx);
                }
            } else {
                // 新增：id 冲突 → 1001
                if ($exists !== null) {
                    OpLogService::record($type, 'create', 0, '新增失败：该 id 已存在', $id, '', $ctx);
                    return fail(error_code()['VALIDATE_FAIL'], '该 id 已存在，请更换后再提交');
                }
                $model::create($normalized);
                $after = $model::find($id)->toArray();
                $name  = $this->targetNameOf($type, $after);
                OpLogService::record(
                    $type,
                    'create',
                    1,
                    '新增：' . self::NAME_LABEL[$type] . '=' . $name,
                    $id,
                    $name,
                    $ctx
                );
            }

            return success($model::find($id)->toArray());
        } catch (\Throwable $e) {
            Log::error("[cms:content] 保存失败 type={$type}：" . $e->getMessage());
            OpLogService::record(
                $type,
                $isEdit ? 'update' : 'create',
                0,
                '保存异常',
                $this->targetOf($type, $data, $normalized),
                '',
                $ctx
            );
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 删除内容（按主键）
     *
     * 埋点：**先取 `target_name` 再删除**（删除后行不存在，无法再取）。
     *
     * @param string            $type 内容类型
     * @param string|int        $id   主键
     * @param OpLogContext|null $ctx  操作日志上下文
     * @return Response 未命中 → 4004
     */
    public function remove(string $type, string|int $id, ?OpLogContext $ctx = null): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            /** @var Model|null $row */
            $row = $model::find($id);
            if ($row === null) {
                OpLogService::record($type, 'delete', 0, '删除失败：资源不存在', (string) $id, '', $ctx);
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            $name = $this->targetNameOf($type, $row->toArray()); // 先取后删
            $row->delete();

            OpLogService::record(
                $type,
                'delete',
                1,
                '删除：' . self::NAME_LABEL[$type] . '=' . $name,
                (string) $id,
                $name,
                $ctx
            );

            return success();
        } catch (\Throwable $e) {
            Log::error("[cms:content] 删除失败 type={$type} id={$id}：" . $e->getMessage());
            OpLogService::record($type, 'delete', 0, '删除异常', (string) $id, '', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 读取关于我们（单例）
     * @return Response data = AboutData（空库时返回默认空结构）
     */
    public function getAbout(): Response
    {
        try {
            $row  = About::singleton();
            $data = $row instanceof About
                ? $row->toAboutData()
                : $this->emptyAbout();

            return success($data);
        } catch (\Throwable $e) {
            Log::error('[cms:content] 关于我们读取失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 保存关于我们（单例整页 upsert id=1）
     * @param array<string, mixed> $data 请求数据
     * @param OpLogContext|null    $ctx  操作日志上下文
     * @return Response data = AboutData
     */
    public function saveAbout(array $data, ?OpLogContext $ctx = null): Response
    {
        $normalized = $this->normalizeAbout($data);

        $validate = new ContentValidate();
        if (!$validate->scene('about')->check($normalized)) {
            OpLogService::record('about', 'update', 0, '校验失败：' . $validate->getError(), 'about', '关于我们', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        try {
            /** @var About|null $row */
            $row    = About::singleton();
            $before = $row instanceof About ? $row->toArray() : [];
            if ($row instanceof About) {
                $row->save($normalized);
            } else {
                $normalized['id'] = About::SINGLETON_ID;
                About::create($normalized);
            }

            $after   = About::singleton()->toArray();
            $changed = $this->changedFields(self::ABOUT_LOG_FIELDS, $before, $after);
            $detail  = $changed === []
                ? '保存成功（内容无变化）'
                : '变更字段：' . implode(', ', $changed);
            OpLogService::record('about', 'update', 1, $detail, 'about', '关于我们', $ctx);

            return success(About::singleton()->toAboutData());
        } catch (\Throwable $e) {
            Log::error('[cms:content] 关于我们保存失败：' . $e->getMessage());
            OpLogService::record('about', 'update', 0, '保存异常', 'about', '关于我们', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 读取网站配置（单例）
     * @return Response data = SiteConfigData（空库时返回默认空结构）
     */
    public function getSiteConfig(): Response
    {
        try {
            $row  = SiteConfig::singleton();
            $data = $row instanceof SiteConfig
                ? $row->toSiteConfig()
                : $this->emptySiteConfig();

            return success($data);
        } catch (\Throwable $e) {
            Log::error('[cms:content] 网站配置读取失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 保存网站配置（单例整页 upsert id=1）
     *
     * 说明：请求体为前端 `SiteConfigData`（嵌套结构）；`nav` / `theme` / `footer.quickLinks`
     * 不在契约内（由前端静态配置提供），即使传入也会被白名单丢弃。
     *
     * @param array<string, mixed> $data 请求数据
     * @param OpLogContext|null    $ctx  操作日志上下文
     * @return Response data = SiteConfigData
     */
    public function saveSiteConfig(array $data, ?OpLogContext $ctx = null): Response
    {
        $normalized = $this->normalizeSiteConfig($data);

        $validate = new ContentValidate();
        if (!$validate->scene('site')->check($normalized)) {
            OpLogService::record('site', 'update', 0, '校验失败：' . $validate->getError(), 'site_config', '网站配置', $ctx);
            return fail(error_code()['VALIDATE_FAIL'], $validate->getError());
        }

        try {
            /** @var SiteConfig|null $row */
            $row    = SiteConfig::singleton();
            $before = $row instanceof SiteConfig ? $row->toArray() : [];
            if ($row instanceof SiteConfig) {
                $row->save($normalized);
            } else {
                $normalized['id'] = SiteConfig::SINGLETON_ID;
                SiteConfig::create($normalized);
            }

            $after   = SiteConfig::singleton()->toArray();
            $changed = $this->changedFields(self::SITE_LOG_FIELDS, $before, $after);
            $detail  = $changed === []
                ? '保存成功（内容无变化）'
                : '变更字段：' . implode(', ', $changed);
            OpLogService::record('site', 'update', 1, $detail, 'site_config', '网站配置', $ctx);

            return success(SiteConfig::singleton()->toSiteConfig());
        } catch (\Throwable $e) {
            Log::error('[cms:content] 网站配置保存失败：' . $e->getMessage());
            OpLogService::record('site', 'update', 0, '保存异常', 'site_config', '网站配置', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 记录一条「编辑保存成功」日志（含变更字段对比）
     *
     * @param string               $type   内容类型
     * @param array<string, mixed> $before 保存前旧行
     * @param array<string, mixed> $after  保存后新行
     * @param string               $id     目标可读标识
     * @param OpLogContext|null    $ctx    操作日志上下文
     * @return void
     */
    protected function recordSave(string $type, array $before, array $after, string $id, ?OpLogContext $ctx): void
    {
        $name    = $this->targetNameOf($type, $after);
        $changed = $this->changedFields(self::SAVE_FIELDS[$type], $before, $after);
        $detail  = $changed === []
            ? '保存成功（内容无变化）'
            : '变更字段：' . implode(', ', $changed);

        OpLogService::record($type, 'update', 1, $detail, $id, $name, $ctx);
    }

    /**
     * 计算白名单字段的变更名列表（宽松比较，兼容 JSON 文本）
     * @param string[]              $fields 参与比较的字段白名单
     * @param array<string, mixed>  $before 保存前旧行
     * @param array<string, mixed>  $after  保存后新行
     * @return string[] 发生变化的字段名列表
     */
    protected function changedFields(array $fields, array $before, array $after): array
    {
        $changed = [];
        foreach ($fields as $field) {
            if (($before[$field] ?? null) != ($after[$field] ?? null)) {
                $changed[] = $field;
            }
        }

        return $changed;
    }

    /**
     * 取目标对象的人类可读名（target_name）
     *
     * 逐类型取字段：product→`name`、news→`title`、case→`name`、
     * advantage→`label`（为空回退 `value`）。缺失时返回空串。
     *
     * @param string               $type 内容类型
     * @param array<string, mixed> $row  行数据
     * @return string
     */
    protected function targetNameOf(string $type, array $row): string
    {
        switch ($type) {
            case 'product':
            case 'case':
                return (string) ($row['name'] ?? '');
            case 'news':
                return (string) ($row['title'] ?? '');
            case 'advantage':
                $label = (string) ($row['label'] ?? '');
                return $label !== '' ? $label : (string) ($row['value'] ?? '');
        }

        return '';
    }

    /**
     * 取目标对象可读标识（target）：优先 slug/id，缺失时回退空串
     * @param string               $type       内容类型
     * @param array<string, mixed> $data       原始请求数据
     * @param array<string, mixed> $normalized 归一化数据
     * @return string
     */
    protected function targetOf(string $type, array $data, array $normalized): string
    {
        if ($type === 'advantage') {
            return (string) ((int) ($data['id'] ?? 0));
        }

        return (string) ($normalized['id'] ?? ($data['id'] ?? ''));
    }

    /**
     * 归一化网站配置（嵌套 camelCase → 扁平 snake_case 白名单）
     *
     * 仅接受契约内字段；`nav` / `theme` / `footer.quickLinks` 等**不在白名单内**，会被丢弃。
     *
     * @param array<string, mixed> $data 原始数据（嵌套）
     * @return array<string, mixed> 扁平字段
     */
    protected function normalizeSiteConfig(array $data): array
    {
        $contact = is_array($data['contact'] ?? null) ? $data['contact'] : [];
        $footer  = is_array($data['footer'] ?? null) ? $data['footer'] : [];
        $seo     = is_array($data['seo'] ?? null) ? $data['seo'] : [];

        /** 取字符串并 trim */
        $str = static function (mixed $value): string {
            return is_scalar($value) ? trim((string) $value) : '';
        };

        return [
            'company_name' => $str($data['companyName'] ?? ''),
            'logo'         => $str($data['logo'] ?? ''),
            'slogan'       => $str($data['slogan'] ?? ''),
            'description'  => $str($data['description'] ?? ''),
            'phone'        => $str($contact['phone'] ?? ''),
            'email'        => $str($contact['email'] ?? ''),
            'address'      => $str($contact['address'] ?? ''),
            'work_time'    => $str($contact['workTime'] ?? ''),
            'map_image'    => $str($contact['mapImage'] ?? ''),
            'copyright'    => $str($footer['copyright'] ?? ''),
            'icp'          => $str($footer['icp'] ?? ''),
            'socials'      => $this->normalizeSocials($footer['socials'] ?? []),
            'seo_title'    => $str($seo['title'] ?? ''),
            'seo_desc'     => $str($seo['description'] ?? ''),
            'seo_keywords' => $str($seo['keywords'] ?? ''),
        ];
    }

    /**
     * 归一化社交链接（{label,url,icon}[]，丢弃 label 为空项，逐项截断）
     * @param mixed $list 原始列表
     * @return array<int, array{label:string,url:string,icon:string}>
     */
    protected function normalizeSocials(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }

        $result = [];
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            $label = mb_substr(trim((string) ($item['label'] ?? '')), 0, 30);
            if ($label === '') {
                continue;
            }
            $result[] = [
                'label' => $label,
                'url'   => mb_substr(trim((string) ($item['url'] ?? '')), 0, 500),
                'icon'  => mb_substr(trim((string) ($item['icon'] ?? '')), 0, 30),
            ];
        }

        return $result;
    }

    /**
     * 空库时的网站配置默认结构（对齐前端 SiteConfigData）
     * @return array<string, mixed>
     */
    protected function emptySiteConfig(): array
    {
        return [
            'companyName' => '',
            'logo'        => '',
            'slogan'      => '',
            'description' => '',
            'contact'     => [
                'phone'    => '',
                'email'    => '',
                'address'  => '',
                'workTime' => '',
                'mapImage' => '',
            ],
            'footer' => [
                'copyright' => '',
                'icp'       => '',
                'socials'   => [],
            ],
            'seo' => [
                'title'       => '',
                'description' => '',
                'keywords'    => '',
            ],
        ];
    }

    /**
     * 归一化普通内容（白名单 + 结构化字段处理）
     * @param string               $type 内容类型
     * @param array<string, mixed> $data 原始数据
     * @return array<string, mixed>
     */
    protected function normalize(string $type, array $data): array
    {
        $result = [];
        foreach (self::SAVE_FIELDS[$type] as $field) {
            if (array_key_exists($field, $data)) {
                $result[$field] = $data[$field];
            }
        }

        // 文本字段去首尾空白（id 例外：不留白）
        foreach ($result as $field => $value) {
            if (is_string($value)) {
                $result[$field] = trim($value);
            }
        }

        // 结构化字段
        if ($type === 'product' && array_key_exists('features', $result)) {
            $result['features'] = $this->normalizeStringList($result['features'], 100);
        }

        // 补齐默认值（types 中 image/icon/cover/logo 等体积小字段）
        if ($type === 'product') {
            $result['features'] = $result['features'] ?? [];
            $result['image']    = $result['image'] ?? '';
            $result['icon']     = $result['icon'] ?? '';
            $result['description'] = $result['description'] ?? '';
        } elseif ($type === 'news') {
            $result['cover'] = $result['cover'] ?? '';
        } elseif ($type === 'case') {
            $result['logo'] = $result['logo'] ?? '';
        } elseif ($type === 'advantage') {
            $result['desc'] = $result['desc'] ?? '';
            unset($result['id'], $result['sort_order']);
            // sort_order 由后台高级字段或种子提供；此处仅在显式传入时保留
            if (array_key_exists('sort_order', $data)) {
                $result['sort_order'] = (int) $data['sort_order'];
            }
        }

        return $result;
    }

    /**
     * 归一化关于我们（白名单 + 结构化字段处理）
     * @param array<string, mixed> $data 原始数据
     * @return array<string, mixed>
     */
    protected function normalizeAbout(array $data): array
    {
        return [
            'intro'     => trim((string) ($data['intro'] ?? '')),
            'vision'    => trim((string) ($data['vision'] ?? '')),
            'mission'   => trim((string) ($data['mission'] ?? '')),
            'values'    => $this->normalizeStringList($data['values'] ?? [], 30),
            'timeline'  => $this->normalizeTimeline($data['timeline'] ?? []),
            'abilities' => $this->normalizeAbilities($data['abilities'] ?? []),
        ];
    }

    /**
     * 归一化字符串列表（去空白、丢弃空项、逐项截断）
     * @param mixed $list     原始列表
     * @param int   $maxChars 单项最大长度
     * @return string[]
     */
    protected function normalizeStringList(mixed $list, int $maxChars): array
    {
        if (!is_array($list)) {
            return [];
        }

        $result = [];
        foreach ($list as $item) {
            if (!is_scalar($item)) {
                continue;
            }
            $text = trim((string) $item);
            if ($text === '') {
                continue;
            }
            $result[] = mb_substr($text, 0, $maxChars);
        }

        return $result;
    }

    /**
     * 归一化发展历程（{year,title,desc}[]）
     * @param mixed $list 原始列表
     * @return array<int, array{year:string,title:string,desc:string}>
     */
    protected function normalizeTimeline(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }

        $result = [];
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            $year = trim((string) ($item['year'] ?? ''));
            if ($year === '') {
                continue;
            }
            $result[] = [
                'year'  => mb_substr($year, 0, 10),
                'title' => mb_substr(trim((string) ($item['title'] ?? '')), 0, 50),
                'desc'  => mb_substr(trim((string) ($item['desc'] ?? '')), 0, 200),
            ];
        }

        return $result;
    }

    /**
     * 归一化能力资质（{title,desc}[]）
     * @param mixed $list 原始列表
     * @return array<int, array{title:string,desc:string}>
     */
    protected function normalizeAbilities(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }

        $result = [];
        foreach ($list as $item) {
            if (!is_array($item)) {
                continue;
            }
            $title = trim((string) ($item['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $result[] = [
                'title' => mb_substr($title, 0, 50),
                'desc'  => mb_substr(trim((string) ($item['desc'] ?? '')), 0, 200),
            ];
        }

        return $result;
    }

    /* ======================= 前台公开只读（供 PublicContent / Home 复用） ======================= */

    /**
     * 公开列表（前台只读，委托同一套查询）
     *
     * 与后台 `list()` 的差别：**不含分页**时返回全量；若传入 page/size 则分页。
     * `case` / `advantage` 前台约定返回 `{items:[...]}`（全量）；`product` / `news`
     * 支持 `page,size,category,keyword`，返回 `{total,page,size,items}`。
     *
     * @param string   $type     内容类型（product|news|case|advantage）
     * @param int|null $page     页码（null=全量）
     * @param int|null $size     每页条数（null=全量）
     * @param string   $keyword  关键词
     * @param string   $category 分类
     * @return Response data 为实体数组或分页结构
     */
    public function publicList(string $type, ?int $page = null, ?int $size = null, string $keyword = '', string $category = ''): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            $query = $model::query();

            // 关键词搜索（多字段 OR，ORM 参数绑定）
            $keyword = trim($keyword);
            if ($keyword !== '') {
                $fields    = self::SEARCH_FIELDS[$type];
                $likeValue = '%' . $keyword . '%';
                $query->where(function ($q) use ($fields, $likeValue) {
                    foreach ($fields as $i => $field) {
                        if ($i === 0) {
                            $q->whereLike($field, $likeValue);
                        } else {
                            $q->whereOr($field, 'like', $likeValue);
                        }
                    }
                });
            }

            // 分类筛选（仅产品/新闻）
            $category = trim($category);
            if ($category !== '' && in_array('category', self::SAVE_FIELDS[$type], true)) {
                $query->where('category', $category);
            }

            // 排序
            foreach (self::ORDER_MAP[$type] as $field => $dir) {
                $query->order($field, $dir);
            }

            // 分页 or 全量
            $paged = $page !== null && $size !== null;

            if ($paged) {
                $page    = $page < 1 ? 1 : $page;
                $size    = $size < 1 ? 10 : min($size, 50);
                $total   = (clone $query)->count();
                $rows    = $query->page($page, $size)->select()->toArray();
                $items   = $this->serializeList($type, $rows);

                return success([
                    'total' => (int) $total,
                    'page'  => $page,
                    'size'  => $size,
                    'items' => $items,
                ]);
            }

            $rows  = $query->select()->toArray();
            $items = $this->serializeList($type, $rows);

            return success(['items' => $items]);
        } catch (\Throwable $e) {
            Log::error("[cms:content] 公开列表查询失败 type={$type}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 公开详情（前台只读）：产品 / 新闻单条
     *
     * @param string     $type 内容类型（product|news）
     * @param string|int $id   主键
     * @return Response 未命中 → 4004
     */
    public function publicDetail(string $type, string|int $id): Response
    {
        if (!in_array($type, self::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = self::MODEL_MAP[$type];

        try {
            /** @var Model|null $row */
            $row = $model::find($id);
            if ($row === null) {
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            return success($this->serializeOne($type, $row->toArray()));
        } catch (\Throwable $e) {
            Log::error("[cms:content] 公开详情查询失败 type={$type} id={$id}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 新闻详情（含上一篇 / 下一篇导航）
     *
     * 排序：按 `date desc, created_at desc`（与列表一致）。**先取全量 id 序列再定位 index**，
     * 不用 id 大小推断先后。`prev = index-1`（更新一条），`next = index+1`（更早一条），越界为 null。
     *
     * @param string $id 新闻 id
     * @return Response data = {item:NewsItem, prev:NewsNav|null, next:NewsNav|null}
     */
    public function newsDetailWithNav(string $id): Response
    {
        try {
            // 全量 id 序列（与列表同序），仅取主键 + 标题用于导航
            $ordered = News::query()
                ->field('id,title')
                ->order(self::ORDER_MAP['news'])
                ->select()
                ->toArray();

            $index = null;
            $total = count($ordered);
            for ($i = 0; $i < $total; $i++) {
                if ((string) $ordered[$i]['id'] === $id) {
                    $index = $i;
                    break;
                }
            }

            if ($index === null) {
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            /** @var News|null $row */
            $row = News::find($id);
            if ($row === null) {
                return fail(error_code()['NOT_FOUND'], '资源不存在');
            }

            /** @var array{id:string,title:string}|null $prev */
            $prev = $index > 0 ? $this->toNav($ordered[$index - 1]) : null;
            /** @var array{id:string,title:string}|null $next */
            $next = $index < $total - 1 ? $this->toNav($ordered[$index + 1]) : null;

            return success([
                'item' => $this->serializeOne('news', $row->toArray()),
                'prev' => $prev,
                'next' => $next,
            ]);
        } catch (\Throwable $e) {
            Log::error("[cms:content] 新闻详情（含导航）查询失败 id={$id}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 首页聚合读取（一次取回多区块，禁止 N+1）
     *
     * 各类型**仅查询一次**：product 取 `productLimit` 条、news 取 `newsLimit` 条；
     * advantages / cases 取全量。排序与各自列表一致。
     *
     * @param int $productLimit 产品条数（1~20）
     * @param int $newsLimit    新闻条数（1~20）
     * @return array<string, array<int, array<string, mixed>>> 四区块实体数组
     */
    public function homeBlocks(int $productLimit, int $newsLimit): array
    {
        $productLimit = max(1, min($productLimit, 20));
        $newsLimit    = max(1, min($newsLimit, 20));

        $products   = Product::query()->order(self::ORDER_MAP['product'])->limit($productLimit)->select()->toArray();
        $advantages = Advantage::query()->order(self::ORDER_MAP['advantage'])->select()->toArray();
        $cases      = CaseItem::query()->order(self::ORDER_MAP['case'])->select()->toArray();
        $news       = News::query()->order(self::ORDER_MAP['news'])->limit($newsLimit)->select()->toArray();

        return [
            'products'   => $this->serializeList('product', $products),
            'advantages' => $this->serializeList('advantage', $advantages),
            'cases'      => $this->serializeList('case', $cases),
            'news'       => $this->serializeList('news', $news),
        ];
    }

    /**
     * 按类型白名单裁剪并规范化单条记录（对外字段）
     * @param string                        $type 内容类型
     * @param array<string, mixed>          $row  原始行
     * @return array<string, mixed>
     */
    public function serializeOne(string $type, array $row): array
    {
        $result = [];

        foreach (self::PUBLIC_FIELDS[$type] as $field) {
            // 字段缺失时补合理默认（保持结构稳定）
            if (!array_key_exists($field, $row)) {
                $result[$field] = in_array($field, ['features', 'values', 'timeline', 'abilities'], true) ? [] : '';
                continue;
            }

            $value = $row[$field];

            // features 等列表字段保证为数组
            if ($field === 'features') {
                $value = is_array($value) ? array_values($value) : [];
            } elseif ($field === 'id' && $type === 'advantage') {
                // advantage 的 id 为自增主键（AdvantageItem 契约）
                $value = (int) $value;
            }

            $result[$field] = $value;
        }

        return $result;
    }

    /**
     * 批量裁剪（对外字段）
     * @param string                             $type 内容类型
     * @param array<int, array<string, mixed>>   $rows 原始行集合
     * @return array<int, array<string, mixed>>
     */
    public function serializeList(string $type, array $rows): array
    {
        $result = [];
        foreach ($rows as $row) {
            $result[] = $this->serializeOne($type, $row);
        }

        return $result;
    }

    /**
     * 组装新闻导航项 {id,title}
     * @param array<string, mixed> $row 含 id/title 的行
     * @return array{id:string,title:string}
     */
    protected function toNav(array $row): array
    {
        return [
            'id'    => (string) ($row['id'] ?? ''),
            'title' => (string) ($row['title'] ?? ''),
        ];
    }

    /**
     * 空库时的关于我们默认结构（对齐前端 AboutData）
     * @return array<string, mixed>
     */
    protected function emptyAbout(): array
    {
        return [
            'intro'     => '',
            'vision'    => '',
            'mission'   => '',
            'values'    => [],
            'timeline'  => [],
            'abilities' => [],
        ];
    }
}
