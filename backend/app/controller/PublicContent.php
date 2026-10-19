<?php
declare(strict_types=1);

namespace app\controller;

use app\service\content\AboutService;
use app\service\content\ContentReadService;
use app\service\content\SiteConfigService;
use think\Request;
use think\Response;

/**
 * 前台公开内容控制器（匿名只读）
 *
 * 查询与字段裁剪**全部委托** `ContentReadService`（单例走 `AboutService` / `SiteConfigService`），
 * 不复制业务逻辑、不另写 SQL；仅返回对外字段（见 `ContentSchema::PUBLIC_FIELDS`）。
 *
 * action 命名（**必须与 C06 路由注册保持一致**）：
 * | action         | 方法 | 路由                          | 说明 |
 * | -------------- | ---- | ----------------------------- | ---- |
 * | productList    | GET  | /api/product/list             | 分页 page,size,category,keyword |
 * | productDetail  | GET  | /api/product/detail?id=       | 未命中 → 4004 |
 * | newsList       | GET  | /api/news/list                | 分页 page,size,category,keyword |
 * | newsDetail     | GET  | /api/news/detail?id=          | {item,prev,next} |
 * | caseList       | GET  | /api/case/list                | {items:CaseItem[]}（全量）|
 * | advantageList  | GET  | /api/advantage/list           | {items:AdvantageItem[]}（含 id）|
 * | aboutDetail    | GET  | /api/about/detail             | AboutData（单例）|
 * | siteConfig     | GET  | /api/site/config              | SiteConfigData（单例，业务字段，不含 nav/theme/quickLinks）|
 */
class PublicContent
{
    /**
     * 内容只读服务（集合型内容）
     * @var ContentReadService
     */
    protected ContentReadService $service;

    /**
     * 关于我们（单例）
     * @var AboutService
     */
    protected AboutService $aboutService;

    /**
     * 网站配置（单例）
     * @var SiteConfigService
     */
    protected SiteConfigService $siteService;

    /**
     * 依赖注入服务
     *
     * @param ContentReadService $service      集合型内容只读
     * @param AboutService       $aboutService 关于我们
     * @param SiteConfigService  $siteService  网站配置
     */
    public function __construct(
        ContentReadService $service,
        AboutService $aboutService,
        SiteConfigService $siteService
    ) {
        $this->service      = $service;
        $this->aboutService = $aboutService;
        $this->siteService  = $siteService;
    }

    /**
     * 产品列表（分页）
     * @param Request $request
     * @return Response
     */
    public function productList(Request $request): Response
    {
        return $this->service->publicList(
            'product',
            (int) $request->param('page', 1),
            (int) $request->param('size', 10),
            (string) $request->param('keyword', ''),
            (string) $request->param('category', '')
        );
    }

    /**
     * 产品详情
     * @param Request $request
     * @return Response
     */
    public function productDetail(Request $request): Response
    {
        return $this->service->publicDetail('product', (string) $request->param('id', ''));
    }

    /**
     * 新闻列表（分页）
     * @param Request $request
     * @return Response
     */
    public function newsList(Request $request): Response
    {
        return $this->service->publicList(
            'news',
            (int) $request->param('page', 1),
            (int) $request->param('size', 10),
            (string) $request->param('keyword', ''),
            (string) $request->param('category', '')
        );
    }

    /**
     * 新闻详情（含上一篇/下一篇）
     * @param Request $request
     * @return Response
     */
    public function newsDetail(Request $request): Response
    {
        return $this->service->newsDetailWithNav((string) $request->param('id', ''));
    }

    /**
     * 案例列表（全量）
     * @param Request $request
     * @return Response
     */
    public function caseList(Request $request): Response
    {
        return $this->service->publicList('case');
    }

    /**
     * 优势列表（全量，含 id）
     * @param Request $request
     * @return Response
     */
    public function advantageList(Request $request): Response
    {
        return $this->service->publicList('advantage');
    }

    /**
     * 关于我们（单例）
     * @param Request $request
     * @return Response
     */
    public function aboutDetail(Request $request): Response
    {
        return $this->aboutService->getAbout();
    }

    /**
     * 网站配置（单例，只读业务字段）
     *
     * 仅返回 `companyName / logo / slogan / description / contact / footer / seo`；
     * 前端把静态配置里的 `nav` / `theme` / `footer.quickLinks` 与之合并成完整 SiteConfig。
     * @param Request $request
     * @return Response
     */
    public function siteConfig(Request $request): Response
    {
        return $this->siteService->getSiteConfig();
    }
}
