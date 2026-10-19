<?php
declare(strict_types=1);

namespace app\service\content;

/**
 * 字符串列表归一化（价值观标签 / 产品特性等）
 *
 * 规则统一：非标量丢弃 → 去首尾空白 → 丢弃空项 → 逐项截断。
 * 抽成静态工具供「内容归一化」与「关于我们归一化」共用，避免两份实现漂移。
 */
final class TextList
{
    /**
     * 归一化字符串列表
     *
     * @param mixed $list     原始列表（非数组一律视为空）
     * @param int   $maxChars 单项最大字符数
     * @return string[]
     */
    public static function normalize(mixed $list, int $maxChars): array
    {
        if (!is_array($list)) {
            return [];
        }

        $result = [];
        foreach ($list as $item) {
            if (!is_scalar($item)) {
                continue;
            }
            $text = trim((string) $item);
            if ($text === '') {
                continue;
            }
            $result[] = mb_substr($text, 0, $maxChars);
        }

        return $result;
    }
}
