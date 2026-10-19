<?php
declare(strict_types=1);

namespace app\service\content;

use app\model\Advantage;
use app\model\CaseItem;
use app\model\News;
use app\model\Product;
use think\facade\Log;
use think\Model;
use think\Response;

/**
 * 前台公开只读服务（产品 / 新闻 / 案例 / 优势）
 *
 * 从原 `ContentService` 拆出的「读」半边：公开列表、公开详情、新闻上下篇导航、
 * 首页聚合，以及对外字段裁剪（`serializeOne` / `serializeList`）。
 *
 * 设计要点：
 * - 全部 ORM 查询，**禁止字符串拼接**；关键词走 `whereLike` 参数绑定；
 * - 对外字段一律走 `ContentSchema::PUBLIC_FIELDS` 白名单，避免内部字段（created_at 等）外泄；
 * - 与后台 CRUD 完全解耦：本类**不写库、不记日志**，可安全用于高并发读路径。
 */
class ContentReadService
{
    /**
     * 公开列表（分页或全量）
     *
     * @param string   $type     内容类型（product|news|case|advantage）
     * @param int|null $page     页码；与 `$size` 同时为 null 时返回全量
     * @param int|null $size     每页条数（1~50，超限钳制）
     * @param string   $keyword  关键词（模糊匹配搜索字段）
     * @param string   $category 分类（仅 product/news 生效）
     * @return Response data = {total,page,size,items} 或 {items}
     */
    public function publicList(
        string $type,
        ?int $page = null,
        ?int $size = null,
        string $keyword = '',
        string $category = ''
    ): Response {
        if (!in_array($type, ContentSchema::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = ContentSchema::MODEL_MAP[$type];

        try {
            $query = $model::query();

            // 关键词搜索（多字段 OR，ORM 参数绑定）
            $keyword = trim($keyword);
            if ($keyword !== '') {
                $fields    = ContentSchema::SEARCH_FIELDS[$type];
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
            if ($category !== '' && in_array('category', ContentSchema::SAVE_FIELDS[$type], true)) {
                $query->where('category', $category);
            }

            // 排序
            foreach (ContentSchema::ORDER_MAP[$type] as $field => $dir) {
                $query->order($field, $dir);
            }

            $paged = $page !== null && $size !== null;

            if ($paged) {
                $page  = $page < 1 ? 1 : $page;
                $size  = $size < 1 ? 10 : min($size, 50);
                $total = (clone $query)->count();
                $rows  = $query->page($page, $size)->select()->toArray();

                return success([
                    'total' => (int) $total,
                    'page'  => $page,
                    'size'  => $size,
                    'items' => $this->serializeList($type, $rows),
                ]);
            }

            $rows = $query->select()->toArray();

            return success(['items' => $this->serializeList($type, $rows)]);
        } catch (\Throwable $e) {
            Log::error("[cms:content] 公开列表查询失败 type={$type}：" . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 公开详情（产品 / 新闻单条）
     *
     * @param string     $type 内容类型（product|news）
     * @param string|int $id   主键
     * @return Response 未命中 → 4004
     */
    public function publicDetail(string $type, string|int $id): Response
    {
        if (!in_array($type, ContentSchema::TYPES, true)) {
            return fail(error_code()['NOT_FOUND'], '不支持的内容类型');
        }

        /** @var class-string<Model> $model */
        $model = ContentSchema::MODEL_MAP[$type];

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
     * 排序与列表一致（`date desc, created_at desc`）：**先取全量 id 序列再定位 index**，
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
                ->order(ContentSchema::ORDER_MAP['news'])
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

            return success([
                'item' => $this->serializeOne('news', $row->toArray()),
                'prev' => $index > 0 ? $this->toNav($ordered[$index - 1]) : null,
                'next' => $index < $total - 1 ? $this->toNav($ordered[$index + 1]) : null,
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

        $products   = Product::query()->order(ContentSchema::ORDER_MAP['product'])->limit($productLimit)->select()->toArray();
        $advantages = Advantage::query()->order(ContentSchema::ORDER_MAP['advantage'])->select()->toArray();
        $cases      = CaseItem::query()->order(ContentSchema::ORDER_MAP['case'])->select()->toArray();
        $news       = News::query()->order(ContentSchema::ORDER_MAP['news'])->limit($newsLimit)->select()->toArray();

        return [
            'products'   => $this->serializeList('product', $products),
            'advantages' => $this->serializeList('advantage', $advantages),
            'cases'      => $this->serializeList('case', $cases),
            'news'       => $this->serializeList('news', $news),
        ];
    }

    /**
     * 按类型白名单裁剪并规范化单条记录（对外字段）
     *
     * @param string               $type 内容类型
     * @param array<string, mixed> $row  原始行
     * @return array<string, mixed>
     */
    public function serializeOne(string $type, array $row): array
    {
        $result = [];

        foreach (ContentSchema::PUBLIC_FIELDS[$type] as $field) {
            // 字段缺失时补合理默认（保持结构稳定）
            if (!array_key_exists($field, $row)) {
                $result[$field] = in_array($field, ['features', 'values', 'timeline', 'abilities'], true) ? [] : '';
                continue;
            }

            $value = $row[$field];

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
     *
     * @param string                           $type 内容类型
     * @param array<int, array<string, mixed>> $rows 原始行集合
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
     *
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
}
