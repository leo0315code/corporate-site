<?php
declare(strict_types=1);

namespace tests\Feature;

use tests\TestCase;
use think\facade\Console;
use think\facade\Db;

/**
 * sitemap:gen 用例：静态页 + 数据库内容都要进地图，且 XML 合法
 */
final class SitemapGenTest extends TestCase
{
    private function outFile(): string
    {
        return dirname(__DIR__, 2) . '/runtime/tests/sitemap-test.xml';
    }

    protected function tearDown(): void
    {
        @unlink($this->outFile());
        parent::tearDown();
    }

    public function testGeneratesUrlSetFromDatabase(): void
    {
        Db::name('product')->insert([
            'id' => 'solution-cloud', 'category' => '解决方案', 'name' => '云原生',
            'summary' => '', 'description' => '', 'features' => '[]', 'image' => '', 'icon' => '',
            'created_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s'),
        ]);
        Db::name('news')->insert([
            'id' => 'news-hello', 'title' => '你好', 'date' => '2026-10-01', 'category' => '公司动态',
            'cover' => '', 'summary' => '', 'content' => '',
            'created_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s'),
        ]);

        // TP 的 call() 接收的是「命令行 token」而非关联数组
        $output = Console::call('sitemap:gen', [
            '--base=https://test.example',
            '--out=' . $this->outFile(),
        ]);

        // buffer 驱动通过 fetch() 取出输出文本
        $this->assertStringContainsString('已生成', (string) $output->fetch(), '命令应正常输出');
        $this->assertFileExists($this->outFile());

        $xml = (string) file_get_contents($this->outFile());
        $this->assertStringContainsString('<urlset', $xml);
        $this->assertStringContainsString('<loc>https://test.example/</loc>', $xml);
        $this->assertStringContainsString('<loc>https://test.example/products/solution-cloud</loc>', $xml);
        $this->assertStringContainsString('<loc>https://test.example/news/news-hello</loc>', $xml);
        $this->assertStringContainsString('<lastmod>', $xml);

        $parsed = simplexml_load_string($xml);
        $this->assertNotFalse($parsed, 'XML 必须可解析');
        $this->assertCount(7, $parsed->url, '5 个静态页 + 1 产品 + 1 新闻');
    }
}
