<?php
declare(strict_types=1);

namespace tests;

use PHPUnit\Framework\TestCase as BaseTestCase;
use think\facade\Db;

/**
 * 用例基类：提供清表与会话重置能力
 *
 * 每个 setUp 清空业务表，避免用例间相互污染（sqlite 单文件库跨用例复用）。
 */
abstract class TestCase extends BaseTestCase
{
    /**
     * 需要清空的表（按依赖顺序无关，均为独立表）
     * @var string[]
     */
    protected array $tables = [
        'admin_user', 'admin_session', 'login_attempt', 'message', 'op_log', 'product',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        foreach ($this->tables as $table) {
            Db::execute('DELETE FROM ' . $table);
        }
    }

    /**
     * 解析统一响应体
     * @param \think\Response $response
     * @return array<string, mixed>
     */
    protected function payload(\think\Response $response): array
    {
        $data = json_decode((string) $response->getContent(), true);

        return is_array($data) ? $data : [];
    }
}
