<?php
declare(strict_types=1);

namespace app\service\content;

/**
 * 操作日志「变更字段」对比
 *
 * 抽成静态工具的原因：后台 CRUD、关于我们、网站配置三条链路都要用它，
 * 但三者的写入逻辑互不相干——放在任一 Service 里都会造成横向依赖。
 *
 * 比较方式为**宽松比较**（`!=`），以兼容 MySQL 返回的 JSON 文本与数组两种形态。
 */
final class ContentDiff
{
    /**
     * 计算白名单字段中发生变化的字段名列表
     *
     * @param string[]             $fields 参与比较的字段白名单
     * @param array<string, mixed> $before 保存前旧行
     * @param array<string, mixed> $after  保存后新行
     * @return string[] 发生变化的字段名（保持白名单顺序）
     */
    public static function changed(array $fields, array $before, array $after): array
    {
        $changed = [];
        foreach ($fields as $field) {
            if (($before[$field] ?? null) != ($after[$field] ?? null)) {
                $changed[] = $field;
            }
        }

        return $changed;
    }
}
