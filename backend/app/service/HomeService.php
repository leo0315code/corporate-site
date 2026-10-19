<?php
declare(strict_types=1);

namespace app\service;

use app\service\content\ContentReadService;
use think\facade\Log;
use think\Response;

/**
 * 首页聚合业务服务
 *
 * 职责：`GET /api/home/summary` 一次返回首页多区块，避免多次往返与 N+1。
 *
 * 区块与条数：
 * - products   ：`productLimit` 条（默认 3，对齐 `APP.HOME_PRODUCT_LIMIT`）
 * - news       ：`newsLimit` 条（默认 3，对齐 `APP.HOME_NEWS_LIMIT`）
 * - advantages ：全量（含 id，`AdvantageItem` 契约）
 * - cases      ：全量
 *
 * 排序由 `ContentReadService` 统一维护（product/news/case created_at|date desc，
 * advantage sort_order asc,id asc），本服务只做参数归一与编排。
 */
class HomeService
{
    /** 首页产品默认条数（对齐前端 APP.HOME_PRODUCT_LIMIT） */
    protected const DEFAULT_PRODUCT_LIMIT = 3;

    /** 首页新闻默认条数（对齐前端 APP.HOME_NEWS_LIMIT） */
    protected const DEFAULT_NEWS_LIMIT = 3;

    /** 单区块条数上限 */
    protected const MAX_LIMIT = 20;

    /**
     * 内容业务服务
     * @var ContentReadService
     */
    protected ContentReadService $content;

    /**
     * 依赖注入
     * @param ContentReadService $content
     */
    public function __construct(ContentReadService $content)
    {
        $this->content = $content;
    }

    /**
     * 首页聚合数据
     *
     * @param int|null $productLimit 产品条数（null=默认 3）
     * @param int|null $newsLimit    新闻条数（null=默认 3）
     * @return Response data = HomeSummary {products,advantages,cases,news}
     */
    public function summary(?int $productLimit = null, ?int $newsLimit = null): Response
    {
        $productLimit = $this->normalizeLimit($productLimit, self::DEFAULT_PRODUCT_LIMIT);
        $newsLimit    = $this->normalizeLimit($newsLimit, self::DEFAULT_NEWS_LIMIT);

        try {
            $blocks = $this->content->homeBlocks($productLimit, $newsLimit);

            return success([
                'products'   => $blocks['products'],
                'advantages' => $blocks['advantages'],
                'cases'      => $blocks['cases'],
                'news'       => $blocks['news'],
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:home] 首页聚合查询失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 归一化条数参数：null / <1 → 默认值；超过上限 → 截断
     * @param int|null $value   入参
     * @param int      $default 默认值
     * @return int
     */
    protected function normalizeLimit(?int $value, int $default): int
    {
        if ($value === null || $value < 1) {
            return $default;
        }

        return min($value, self::MAX_LIMIT);
    }
}
