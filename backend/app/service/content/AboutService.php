<?php
declare(strict_types=1);

namespace app\service\content;

use app\model\About;
use app\service\OpLogContext;
use app\service\OpLogService;
use app\validate\ContentValidate;
use think\facade\Log;
use think\Response;

/**
 * 「关于我们」单例服务
 *
 * 从原 `ContentService` 拆出：单例读写与嵌套结构归一化（价值观 / 时间轴 / 能力资质）
 * 与产品/新闻等集合型内容没有共享逻辑，独立后各自只需关注自身契约。
 *
 * 埋点：保存成功后按 `ContentSchema::ABOUT_LOG_FIELDS` 对比变更字段写入 `op_log`；
 * 内容无变化时记「保存成功（内容无变化）」，便于审计区分。
 */
class AboutService
{
    /**
     * 读取关于我们（空库返回默认空结构）
     * @return Response data = AboutData
     */
    public function getAbout(): Response
    {
        try {
            $row  = About::singleton();
            $data = $row instanceof About ? $row->toAboutData() : $this->emptyAbout();

            return success($data);
        } catch (\Throwable $e) {
            Log::error('[cms:about] 关于我们读取失败：' . $e->getMessage());
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 保存关于我们（单例整页 upsert id=1）
     *
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
            $changed = ContentDiff::changed(ContentSchema::ABOUT_LOG_FIELDS, $before, $after);
            $detail  = $changed === []
                ? '保存成功（内容无变化）'
                : '变更字段：' . implode(', ', $changed);
            OpLogService::record('about', 'update', 1, $detail, 'about', '关于我们', $ctx);

            return success(About::singleton()->toAboutData());
        } catch (\Throwable $e) {
            Log::error('[cms:about] 关于我们保存失败：' . $e->getMessage());
            OpLogService::record('about', 'update', 0, '保存异常', 'about', '关于我们', $ctx);
            return fail(error_code()['SERVER_ERROR'], '服务器开小差了，请稍后重试');
        }
    }

    /**
     * 归一化关于我们（白名单 + 结构化字段处理）
     *
     * @param array<string, mixed> $data 原始数据
     * @return array<string, mixed>
     */
    protected function normalizeAbout(array $data): array
    {
        return [
            'intro'     => trim((string) ($data['intro'] ?? '')),
            'vision'    => trim((string) ($data['vision'] ?? '')),
            'mission'   => trim((string) ($data['mission'] ?? '')),
            'values'    => TextList::normalize($data['values'] ?? [], 30),
            'timeline'  => $this->normalizeTimeline($data['timeline'] ?? []),
            'abilities' => $this->normalizeAbilities($data['abilities'] ?? []),
        ];
    }

    /**
     * 归一化发展历程（{year,title,desc}[]，year 为空则丢弃）
     *
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
     * 归一化能力资质（{title,desc}[]，title 为空则丢弃）
     *
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

    /**
     * 空库时的默认结构（对齐前端 AboutData）
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
