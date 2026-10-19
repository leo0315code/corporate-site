<?php
declare(strict_types=1);

namespace tests\Feature;

use app\model\AdminSession;
use tests\TestCase;

/**
 * 会话滑动续期用例
 */
final class SessionRenewTest extends TestCase
{
    private function seedSession(int $expiresInSeconds): AdminSession
    {
        /** @var AdminSession $session */
        $session = AdminSession::create([
            'admin_id'   => 1,
            'token'      => bin2hex(random_bytes(32)),
            'expires_at' => date('Y-m-d H:i:s', time() + $expiresInSeconds),
            'ip'         => '10.0.0.1',
            'user_agent' => 'phpunit',
        ]);

        return $session;
    }

    public function testRenewsWhenRemainingBelowThreshold(): void
    {
        $session = $this->seedSession(600); // 剩余 10 分钟 < 30 分钟阈值

        $this->assertTrue(AdminSession::renewIfNeeded($session));

        $remain = strtotime((string) $session->expires_at) - time();
        $this->assertGreaterThan(AdminSession::TTL_SECONDS - 10, $remain, '应顺延一个完整 TTL');
        $this->assertLessThanOrEqual(AdminSession::TTL_SECONDS + 5, $remain);

        // 已落库
        $reloaded = AdminSession::find($session->id);
        $this->assertSame((string) $session->expires_at, (string) $reloaded->expires_at);
    }

    public function testDoesNotRenewWhenRemainingIsEnough(): void
    {
        $session = $this->seedSession(5400); // 剩余 90 分钟
        $before  = (string) $session->expires_at;

        $this->assertFalse(AdminSession::renewIfNeeded($session));
        $this->assertSame($before, (string) $session->expires_at, '不应延长到期时间');
    }

    public function testDoesNotRenewExpiredSession(): void
    {
        $session = $this->seedSession(-60);

        $this->assertFalse(AdminSession::renewIfNeeded($session));
    }
}
