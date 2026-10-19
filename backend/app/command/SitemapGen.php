<?php
declare(strict_types=1);

namespace app\command;

use think\console\Command;
use think\console\Input;
use think\console\input\Option;
use think\console\Output;
use think\facade\Db;
use think\facade\Log;

/**
 * 站点地图生成命令 `php think sitemap:gen`
 *
 * 为什么用命令而不是 HTTP 接口：
 * - 站点地图是**静态资源**，随 `frontend/dist` 一起发布，零运行时开销；
 * - 内容变更由后台触达，定时（如每日 03:00）重建即可，无需反代额外路径。
 *
 * 内容来源：数据库（产品 / 新闻），保证与线上一致；静态页（首页/关于/产品/新闻/联系）固定输出。
 *
 * 参数：
 * - `--base`：站点根地址，默认取环境变量 `SITE_URL`（再默认 `https://www.example.com`）；
 * - `--out` ：输出路径，默认 `frontend/public/sitemap.xml`。
 */
class SitemapGen extends Command
{
    /**
     * 配置命令
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('sitemap:gen')
            ->addOption('base', 'b', Option::VALUE_OPTIONAL, '站点根地址（如 https://www.example.com）', null)
            ->addOption('out', 'o', Option::VALUE_OPTIONAL, '输出文件路径', null)
            ->setDescription('根据数据库内容生成静态 sitemap.xml（默认写入 frontend/public/）');
    }

    /**
     * 执行命令
     * @param Input  $input
     * @param Output $output
     * @return int 0=成功，1=失败
     */
    protected function execute(Input $input, Output $output): int
    {
        $base = trim((string) ($input->getOption('base') ?? env('SITE_URL', 'https://www.example.com')));
        $base = rtrim($base, '/');

        if ($base === '' || !filter_var($base, FILTER_VALIDATE_URL)) {
            $output->writeln('<error>站点根地址不合法，请传 --base 或配置 SITE_URL</error>');
            return 1;
        }

        $out = (string) ($input->getOption('out') ?? '');
        if ($out === '') {
            $out = dirname(root_path()) . DIRECTORY_SEPARATOR . 'frontend'
                . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'sitemap.xml';
        }

        $urls = [
            ['loc' => '/', 'lastmod' => null, 'priority' => '1.0', 'changefreq' => 'daily'],
            ['loc' => '/products', 'lastmod' => null, 'priority' => '0.9', 'changefreq' => 'weekly'],
            ['loc' => '/news', 'lastmod' => null, 'priority' => '0.9', 'changefreq' => 'daily'],
            ['loc' => '/about', 'lastmod' => null, 'priority' => '0.6', 'changefreq' => 'monthly'],
            ['loc' => '/contact', 'lastmod' => null, 'priority' => '0.6', 'changefreq' => 'monthly'],
        ];

        try {
            foreach (Db::name('product')->field('id,updated_at')->select() as $row) {
                $urls[] = [
                    'loc'        => '/products/' . rawurlencode((string) $row['id']),
                    'lastmod'    => $this->lastmod((string) $row['updated_at']),
                    'priority'   => '0.8',
                    'changefreq' => 'monthly',
                ];
            }

            foreach (Db::name('news')->field('id,updated_at')->select() as $row) {
                $urls[] = [
                    'loc'        => '/news/' . rawurlencode((string) $row['id']),
                    'lastmod'    => $this->lastmod((string) $row['updated_at']),
                    'priority'   => '0.7',
                    'changefreq' => 'monthly',
                ];
            }

            $xml = $this->buildXml($base, $urls);

            if (!is_dir(dirname($out)) && !mkdir(dirname($out), 0777, true) && !is_dir(dirname($out))) {
                throw new \RuntimeException('输出目录不可写：' . dirname($out));
            }
            if (file_put_contents($out, $xml) === false) {
                throw new \RuntimeException('写入失败：' . $out);
            }
        } catch (\Throwable $e) {
            Log::error('[cms:sitemap] 生成失败：' . $e->getMessage());
            $output->writeln('<error>生成失败：' . $e->getMessage() . '</error>');
            return 1;
        }

        $output->writeln(sprintf('<info>已生成 %d 条 URL：%s</info>', count($urls), $out));

        return 0;
    }

    /**
     * 归一化 lastmod 为 W3C 日期
     * @param string $datetime
     * @return string|null
     */
    private function lastmod(string $datetime): ?string
    {
        if ($datetime === '') {
            return null;
        }

        $ts = strtotime($datetime);

        return $ts === false ? null : date('Y-m-d', $ts);
    }

    /**
     * 构造 sitemap XML
     * @param string $base 站点根地址
     * @param array<int, array{loc:string,lastmod:?string,priority:string,changefreq:string}> $urls
     * @return string
     */
    private function buildXml(string $base, array $urls): string
    {
        $items = '';

        foreach ($urls as $url) {
            $items .= "  <url>\n";
            $items .= '    <loc>' . htmlspecialchars($base . $url['loc'], ENT_XML1 | ENT_QUOTES, 'UTF-8') . "</loc>\n";
            if ($url['lastmod'] !== null) {
                $items .= '    <lastmod>' . $url['lastmod'] . "</lastmod>\n";
            }
            $items .= '    <changefreq>' . $url['changefreq'] . "</changefreq>\n";
            $items .= '    <priority>' . $url['priority'] . "</priority>\n";
            $items .= "  </url>\n";
        }

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            . "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
            . $items
            . "</urlset>\n";
    }
}
