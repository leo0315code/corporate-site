<?php
declare(strict_types=1);

namespace app\service;

use app\model\Advantage;
use app\model\CaseItem;
use app\model\News;
use app\model\Product;
use app\service\content\ContentDiff;
use app\service\content\ContentSchema;
use app\service\content\TextList;
use app\validate\ContentValidate;
use think\facade\Log;
use think\Model;
use think\Response;

/**
 * 内容业务服务（产品 / 新闻 / 案例 / 优势 —— **后台写侧**）
 *
 * 统一按「类型」编排四类内容的列表（分页 + 关键词 + 分类）、保存（新增 / 编辑）、详情、删除。
 *
 * 职责边界（2026-10 拆分后）：
 * - **本类**：后台 CRUD + 写入归一化 + 操作日志埋点；
 * - `app\service\content\ContentReadService`：前台公开只读（列表/详情/首页聚合/字段裁剪）；
 * - `app\service\content\AboutService` / `SiteConfigService`：两个单例（关于我们 / 网站配置）；
 * - `app\service\content\ContentSchema`：类型元数据（模型映射、字段白名单、排序）；
 * - `app\service\content\ContentDiff` / `TextList`：日志变更对比、字符串列表归一化的共享工具。
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
     * 类型 → 模型类映射（见 `ContentSchema`）
     * @var array<string, class-string<Model>>
     */
    protected const MODEL_MAP = ContentSchema::MODEL_MAP;

    /**
     * 类型 → 可搜索字段（见 `ContentSchema`）
     * @var array<string, string[]>
     */
    protected const SEARCH_FIELDS = ContentSchema::SEARCH_FIELDS;

    /**
     * 类型 → 写入白名单字段（见 `ContentSchema`）
     * @var array<string, string[]>
     */
    protected const SAVE_FIELDS = ContentSchema::SAVE_FIELDS;

    /**
     * 类型 → 排序规则（见 `ContentSchema`）
     * @var array<string, array<string, string>>
     */
    protected const ORDER_MAP = ContentSchema::ORDER_MAP;

    /**
     * 支持的内容类型（见 `ContentSchema`）
     * @var string[]
     */
    protected const TYPES = ContentSchema::TYPES;

    /**
     * 内容类型 → 日志名称标签（见 `ContentSchema`）
     * @var array<string, string>
     */
    protected const NAME_LABEL = ContentSchema::NAME_LABEL;

    /**
     * 类型 → 对外字段白名单（见 `ContentSchema`）
     * @var array<string, string[]>
     */
    public const PUBLIC_FIELDS = ContentSchema::PUBLIC_FIELDS;


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
     * - **编辑态命中不到记录 → 4004**（`id` 构成前台 URL，**创建后不可修改**；
     *   不做静默 upsert，避免改名后旧链接 404 + 悄悄多出一条记录）；
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
                    // 编辑态但目标不存在：**拒绝**，不再静默 upsert 新建。
                    // 原因：id 构成前台详情页 URL，改名等于换链接且旧链接 404；
                    // 这里改成显式报错，避免「改了 id → 悄悄多出一条记录」。
                    OpLogService::record($type, 'update', 0, '编辑失败：资源不存在（id 可能被修改）', $id, '', $ctx);
                    return fail(
                        error_code()['NOT_FOUND'],
                        '资源不存在或已被删除，请刷新后重试（唯一标识 id 创建后不可修改）'
                    );
                }
                $before = $exists->toArray();
                $exists->save($normalized);
                $after = $model::find($id)->toArray();
                $this->recordSave($type, $before, $after, $id, $ctx);
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
        $changed = ContentDiff::changed(self::SAVE_FIELDS[$type], $before, $after);
        $detail  = $changed === []
            ? '保存成功（内容无变化）'
            : '变更字段：' . implode(', ', $changed);

        OpLogService::record($type, 'update', 1, $detail, $id, $name, $ctx);
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
            $result['features'] = TextList::normalize($result['features'], 100);
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
}
