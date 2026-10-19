<?php
declare(strict_types=1);

namespace tests\Feature;

use app\service\content\AboutService;
use app\service\content\SiteConfigService;
use tests\TestCase;
use think\facade\Db;

/**
 * 单例服务用例（关于我们 / 网站配置）
 *
 * 覆盖拆分后的两个独立服务：空库默认结构、保存往返一致、白名单字段丢弃。
 */
final class SingletonServiceTest extends TestCase
{
    public function testAboutEmptyAndRoundTrip(): void
    {
        $service = new AboutService();

        $empty = $this->payload($service->getAbout());
        $this->assertSame(0, $empty['code']);
        $this->assertSame([], $empty['data']['values'], '空库应返回空结构');

        $saved = $this->payload($service->saveAbout([
            'intro'     => '  简介  ',
            'vision'    => '愿景',
            'mission'   => '使命',
            'values'    => ['诚信', '  ', '创新'],
            'timeline'  => [
                ['year' => '2020', 'title' => '成立', 'desc' => '起步'],
                ['year' => '', 'title' => '应被丢弃', 'desc' => ''],
            ],
            'abilities' => [['title' => '研发', 'desc' => '自研']],
        ]));

        $this->assertSame(0, $saved['code']);
        $this->assertSame('简介', $saved['data']['intro'], '首尾空白应被裁剪');
        $this->assertSame(['诚信', '创新'], $saved['data']['values'], '空项应被丢弃');
        $this->assertCount(1, $saved['data']['timeline'], 'year 为空的历程应被丢弃');

        // 单例：只允许 1 行
        $this->assertSame(1, (int) Db::name('about')->count());
    }

    public function testSiteConfigRoundTripDropsUnknownFields(): void
    {
        $service = new SiteConfigService();

        $empty = $this->payload($service->getSiteConfig());
        $this->assertSame(0, $empty['code']);
        $this->assertSame('', $empty['data']['companyName']);

        $saved = $this->payload($service->saveSiteConfig([
            'companyName' => '示例科技',
            'slogan'      => '口号',
            'contact'     => ['phone' => '010-0000', 'workTime' => '9:00-18:00'],
            'footer'      => [
                'copyright'  => '©2026',
                'icp'        => '京ICP备00000000号',
                'socials'    => [['label' => '微信', 'url' => 'https://x', 'icon' => 'wechat'], ['label' => '']],
                // quickLinks 不在契约内，应被丢弃
                'quickLinks' => [['label' => '首页', 'path' => '/']],
            ],
            'seo'         => ['title' => '标题', 'description' => '描述', 'keywords' => 'a,b'],
            // 以下两项**不应落库/回写**
            'nav'         => [['label' => '首页', 'path' => '/']],
            'theme'       => ['primary' => '#000'],
        ]));

        $this->assertSame(0, $saved['code']);
        $this->assertSame('示例科技', $saved['data']['companyName']);
        $this->assertSame('010-0000', $saved['data']['contact']['phone']);
        $this->assertSame('京ICP备00000000号', $saved['data']['footer']['icp']);
        $this->assertCount(1, $saved['data']['footer']['socials'], 'label 为空的社交链接应被丢弃');
        $this->assertArrayNotHasKey('nav', $saved['data'], 'nav 不由后端维护');
        $this->assertArrayNotHasKey('theme', $saved['data'], 'theme 不由后端维护');
        $this->assertSame(1, (int) Db::name('site_config')->count());
    }
}
