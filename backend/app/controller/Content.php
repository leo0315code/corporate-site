<?php
declare(strict_types=1);

namespace app\controller;

use app\service\ContentService;
use app\service\content\AboutService;
use app\service\content\SiteConfigService;
use app\service\OpLogContext;
use think\Request;
use think\Response;

/**
 * 内容管理控制器（后台，全部需 AdminAuth 鉴权）
 *
 * action 命名（**必须与本文件、C06 路由注册保持一致**）：
 * | action            | 方法 | 路由（{P} = CMS_PATH）                       |
 * | ----------------- | ---- | ------------------------------------------- |
 * | productList       | GET  | {P}/api/content/product/list                |
 * | productSave       | POST | {P}/api/content/product/save                |
 * | productDelete     | POST | {P}/api/content/product/delete              |
 * | newsList          | GET  | {P}/api/content/news/list                   |
 * | newsSave          | POST | {P}/api/content/news/save                   |
 * | newsDelete        | POST | {P}/api/content/news/delete                 |
 * | caseList          | GET  | {P}/api/content/case/list                   |
 * | caseSave          | POST | {P}/api/content/case/save                   |
 * | caseDelete        | POST | {P}/api/content/case/delete                 |
 * | advantageList     | GET  | {P}/api/content/advantage/list              |
 * | advantageSave     | POST | {P}/api/content/advantage/save              |
 * | advantageDelete   | POST | {P}/api/content/advantage/delete            |
 * | aboutDetail       | GET  | {P}/api/content/about/detail                |
 * | aboutSave         | POST | {P}/api/content/about/save                  |
 *
 * 内容 CRUD 由 `ContentService` 编排、单例由 `AboutService` / `SiteConfigService` 承担，本控制器仅做参数读取与分发。
 */
class Content
{
    /**
     * 内容业务服务（产品 / 新闻 / 案例 / 优势 CRUD）
     * @var ContentService
     */
    protected ContentService $service;

    /**
     * 关于我们（单例）服务
     * @var AboutService
     */
    protected AboutService $aboutService;

    /**
     * 网站配置（单例）服务
     * @var SiteConfigService
     */
    protected SiteConfigService $siteService;

    /**
     * 依赖注入业务服务
     *
     * 三块职责已在 2026-10 拆分：集合型内容 / 关于我们 / 网站配置各由独立服务承担，
     * 控制器只做参数读取与分发。
     *
     * @param ContentService    $service      集合型内容
     * @param AboutService      $aboutService 关于我们
     * @param SiteConfigService $siteService  网站配置
     */
    public function __construct(
        ContentService $service,
        AboutService $aboutService,
        SiteConfigService $siteService
    ) {
        $this->service      = $service;
        $this->aboutService = $aboutService;
        $this->siteService  = $siteService;
    }

    /* ======================= 产品 ======================= */

    /**
     * 产品列表
     * @param Request $request
     * @return Response
     */
    public function productList(Request $request): Response
    {
        return $this->doList($request, 'product');
    }

    /**
     * 产品新增 / 编辑
     * @param Request $request
     * @return Response
     */
    public function productSave(Request $request): Response
    {
        return $this->service->save('product', $this->payload($request), $this->logContext($request));
    }

    /**
     * 产品删除
     * @param Request $request
     * @return Response
     */
    public function productDelete(Request $request): Response
    {
        return $this->service->remove('product', $this->idParam($request), $this->logContext($request));
    }

    /* ======================= 新闻 ======================= */

    /**
     * 新闻列表
     * @param Request $request
     * @return Response
     */
    public function newsList(Request $request): Response
    {
        return $this->doList($request, 'news');
    }

    /**
     * 新闻新增 / 编辑
     * @param Request $request
     * @return Response
     */
    public function newsSave(Request $request): Response
    {
        return $this->service->save('news', $this->payload($request), $this->logContext($request));
    }

    /**
     * 新闻删除
     * @param Request $request
     * @return Response
     */
    public function newsDelete(Request $request): Response
    {
        return $this->service->remove('news', $this->idParam($request), $this->logContext($request));
    }

    /* ======================= 案例 ======================= */

    /**
     * 案例列表
     * @param Request $request
     * @return Response
     */
    public function caseList(Request $request): Response
    {
        return $this->doList($request, 'case');
    }

    /**
     * 案例新增 / 编辑
     * @param Request $request
     * @return Response
     */
    public function caseSave(Request $request): Response
    {
        return $this->service->save('case', $this->payload($request), $this->logContext($request));
    }

    /**
     * 案例删除
     * @param Request $request
     * @return Response
     */
    public function caseDelete(Request $request): Response
    {
        return $this->service->remove('case', $this->idParam($request), $this->logContext($request));
    }

    /* ======================= 优势 ======================= */

    /**
     * 优势列表
     * @param Request $request
     * @return Response
     */
    public function advantageList(Request $request): Response
    {
        return $this->doList($request, 'advantage');
    }

    /**
     * 优势新增 / 编辑
     * @param Request $request
     * @return Response
     */
    public function advantageSave(Request $request): Response
    {
        return $this->service->save('advantage', $this->payload($request), $this->logContext($request));
    }

    /**
     * 优势删除
     * @param Request $request
     * @return Response
     */
    public function advantageDelete(Request $request): Response
    {
        return $this->service->remove('advantage', $this->idParam($request), $this->logContext($request));
    }

    /* ======================= 关于我们 ======================= */

    /**
     * 关于我们（读取，单例）
     * @param Request $request
     * @return Response
     */
    public function aboutDetail(Request $request): Response
    {
        return $this->aboutService->getAbout();
    }

    /**
     * 关于我们（整页保存）
     * @param Request $request
     * @return Response
     */
    public function aboutSave(Request $request): Response
    {
        return $this->aboutService->saveAbout($this->payload($request), $this->logContext($request));
    }

    /* ======================= 网站配置 ======================= */

    /**
     * 网站配置（读取，单例）
     * @param Request $request
     * @return Response
     */
    public function siteDetail(Request $request): Response
    {
        return $this->siteService->getSiteConfig();
    }

    /**
     * 网站配置（整页保存）
     * @param Request $request
     * @return Response
     */
    public function siteSave(Request $request): Response
    {
        return $this->siteService->saveSiteConfig($this->payload($request), $this->logContext($request));
    }

    /* ======================= 内部工具 ======================= */

    /**
     * 读取操作日志上下文（中间件注入 `$request->opLogContext`）
     *
     * @param Request $request
     * @return OpLogContext|null
     */
    protected function logContext(Request $request): ?OpLogContext
    {
        $ctx = $request->opLogContext;

        return $ctx instanceof OpLogContext ? $ctx : null;
    }

    /**
     * 通用列表分发（读取分页/搜索/分类参数）
     * @param Request $request
     * @param string  $type
     * @return Response
     */
    protected function doList(Request $request, string $type): Response
    {
        $page     = (int) $request->param('page', 1);
        $size     = (int) $request->param('size', 10);
        $keyword  = (string) $request->param('keyword', '');
        $category = (string) $request->param('category', '');

        return $this->service->list($type, $page, $size, $keyword, $category);
    }

    /**
     * 读取请求体（兼容 JSON 与表单）
     * @param Request $request
     * @return array<string, mixed>
     */
    protected function payload(Request $request): array
    {
        $payload = $request->post();
        if (empty($payload)) {
            $payload = $request->param();
        }

        return is_array($payload) ? $payload : [];
    }

    /**
     * 读取主键参数（删除用；兼容 id 字符串与数字）
     * @param Request $request
     * @return string|int
     */
    protected function idParam(Request $request): string|int
    {
        $payload = $this->payload($request);
        $raw     = $payload['id'] ?? $request->param('id', '');

        // 优势为整型主键
        if (is_int($raw) || (is_string($raw) && ctype_digit($raw) && $raw !== '')) {
            return (int) $raw;
        }

        return (string) $raw;
    }
}
