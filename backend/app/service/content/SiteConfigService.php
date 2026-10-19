<?php
declare(strict_types=1);

namespace app\service\content;

use app\model\SiteConfig;
use app\service\OpLogContext;
use app\service\OpLogService;
use app\validate\ContentValidate;
use think\facade\Log;
use think\Response;

/**
 * 「网站配置」单例服务（公司信息 / 联系方式 / 页脚 / SEO）
 *
 * 从原 `ContentService` 拆出。请求体是前端 `SiteConfigData` 的**嵌套结构**
 * （contact / footer / seo），落库前拍平为 snake_case 白名单字段。
 *
 * **刻意不接管** `nav` / `theme` / `footer.quickLinks`：这三项由前端静态配置驱动
 * （导航配错会 404、主题色受构建期 Tailwind 约束），即使请求里带了也会被白名单丢弃。
 */
class SiteConfigService
{
    /**
     * 读取网站配置（空库返回默认空结构）
     * @return Response data = SiteConfigData
     */
    public function getSiteConfig(): Response
    {
        try {
            $row  = SiteConfig::singleton();
            $data = $row instanceof SiteConfig ? $row->toSiteConfig() : $this->emptySiteConfig();

            return success($data);
        } catch (\Throwable $e) {
            Log::error('[cms:site] 网站配置读取失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 保存网站配置（单例整页 upsert id=1）
     *
     * @param array<string, mixed> $data 请求数据（嵌套）
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
            $changed = ContentDiff::changed(ContentSchema::SITE_LOG_FIELDS, $before, $after);
            $detail  = $changed === []
                ? '保存成功（内容无变化）'
                : '变更字段：' . implode(', ', $changed);
            OpLogService::record('site', 'update', 1, $detail, 'site_config', '网站配置', $ctx);

            return success(SiteConfig::singleton()->toSiteConfig());
        } catch (\Throwable $e) {
            Log::error('[cms:site] 网站配置保存失败：' . $e->getMessage());
            OpLogService::record('site', 'update', 0, '保存异常', 'site_config', '网站配置', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 归一化网站配置（嵌套 camelCase → 扁平 snake_case 白名单）
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
     *
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
}
