<?php
declare(strict_types=1);

namespace tests\Feature;

use app\service\OpLogContext;
use app\service\OpLogService;
use tests\TestCase;
use think\facade\Db;

/**
 * 操作日志用例（审计链路）
 *
 * 覆盖：字段白名单收口、detail 截断、默认上下文、写入失败不抛出、默认 7 天窗口。
 */
final class OpLogTest extends TestCase
{
    public function testRecordWritesTenantFieldsAndClipsDetail(): void
    {
        OpLogService::record(
            'product',
            'update',
            1,
            str_repeat('改', 600),
            'solution-cloud',
            '云原生解决方案',
            new OpLogContext(7, 'ops', '10.0.0.9', 'phpunit')
        );

        $row = Db::name('op_log')->select()->toArray()[0];
        $this->assertSame('product', $row['module']);
        $this->assertSame('update', $row['action']);
        $this->assertSame('solution-cloud', $row['target']);
        $this->assertSame(7, (int) $row['admin_id']);
        $this->assertSame('ops', $row['admin_name']);
        $this->assertSame(500, mb_strlen((string) $row['detail']), 'detail 应截断到 500（含省略号）');
        $this->assertStringEndsWith('…', (string) $row['detail']);
    }

    public function testRecordFallsBackToSystemContext(): void
    {
        OpLogService::record('upload', 'upload', 1, 'ok');

        $row = Db::name('op_log')->select()->toArray()[0];
        $this->assertSame('system', $row['admin_name']);
        $this->assertSame(0, (int) $row['admin_id']);
    }

    public function testRecordNeverThrowsWhenTableMissing(): void
    {
        // 写入旁路：日志表不可用时不得影响主业务
        Db::execute('ALTER TABLE op_log RENAME TO op_log_backup');

        try {
            OpLogService::record('product', 'delete', 1, 'should not throw');
            $this->assertTrue(true, 'record() 不得抛出异常');
        } finally {
            Db::execute('ALTER TABLE op_log_backup RENAME TO op_log');
        }

        $this->assertSame(0, (int) Db::name('op_log')->count(), '异常路径不应留下半条记录');
    }

    public function testListDefaultsToLastSevenDays(): void
    {
        Db::name('op_log')->insert([
            'admin_id'    => 1,
            'admin_name'  => 'ops',
            'created_at'  => date('Y-m-d H:i:s', strtotime('-30 days')),
            'module'      => 'news',
            'action'      => 'create',
            'target'      => 'old',
            'target_name' => '旧日志',
            'ip'          => '10.0.0.1',
            'user_agent'  => '',
            'result'      => 1,
            'detail'      => '',
        ]);
        OpLogService::record('news', 'create', 1, '新日志', 'new', '新内容');

        $result = (new OpLogService())->list(1, 10);
        $body   = $this->payload($result);

        $this->assertSame(0, $body['code']);
        $this->assertSame(1, $body['data']['total'], '默认只查最近 7 天');
        $this->assertSame('news', $body['data']['items'][0]['module']);
    }

    public function testListRejectsIllegalFilter(): void
    {
        $response = (new OpLogService())->list(1, 10, 'not-a-module');
        $body     = $this->payload($response);

        $this->assertSame(1001, $body['code']);
        $this->assertSame(400, $response->getCode());
    }
}
