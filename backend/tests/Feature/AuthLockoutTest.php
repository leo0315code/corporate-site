<?php
declare(strict_types=1);

namespace tests\Feature;

use app\model\AdminSession;
use app\model\AdminUser;
use app\model\LoginAttempt;
use app\service\AuthService;
use tests\TestCase;

/**
 * 登录锁定用例（安全核心路径）
 *
 * 覆盖：连续失败达阈值 → 1005 锁定；锁定期内即使密码正确也拒绝；
 *     成功登录签发 64 位十六进制 Token 并落 admin_session；审计落库。
 */
final class AuthLockoutTest extends TestCase
{
    private const PASSWORD = 'Passw0rd!Demo';

    private function seedAdmin(string $username = 'admin'): AdminUser
    {
        /** @var AdminUser $admin */
        $admin = AdminUser::create([
            'username'             => $username,
            'password_hash'        => password_hash(self::PASSWORD, PASSWORD_BCRYPT),
            'must_change_password' => 0,
            'status'               => 1,
            'is_primary'           => 1,
        ]);

        return $admin;
    }

    public function testFiveFailuresLockAccount(): void
    {
        $this->seedAdmin();
        $service = new AuthService();
        $ip      = '203.0.113.10';

        $codes = [];
        for ($i = 0; $i < LoginAttempt::MAX_FAIL; $i++) {
            $codes[] = (int) $this->payload($service->login('admin', 'wrong-pass', $ip, 'phpunit'))['code'];
        }

        // 前 4 次为密码错误，第 5 次触发锁定
        $this->assertSame(array_fill(0, 4, 1004), array_slice($codes, 0, 4));
        $this->assertSame(1005, $codes[4], '第 5 次应返回锁定');

        $this->assertGreaterThan(0, LoginAttempt::lockedSeconds(LoginAttempt::SCOPE_ACCOUNT, 'admin'));
    }

    public function testCorrectPasswordRejectedWhileLocked(): void
    {
        $this->seedAdmin();
        $service = new AuthService();
        $ip      = '203.0.113.11';

        for ($i = 0; $i < LoginAttempt::MAX_FAIL; $i++) {
            $service->login('admin', 'wrong-pass', $ip, 'phpunit');
        }

        $response = $service->login('admin', self::PASSWORD, $ip, 'phpunit');

        $this->assertSame(1005, (int) $this->payload($response)['code']);
        $this->assertSame(423, $response->getCode(), '锁定应映射为 HTTP 423');
        $this->assertSame(0, AdminSession::count(), '锁定期间不得签发会话');
    }

    public function testSuccessfulLoginIssuesTokenAndAudits(): void
    {
        $this->seedAdmin();
        $service = new AuthService();

        $response = $service->login('admin', self::PASSWORD, '203.0.113.12', 'phpunit/1.0');
        $body     = $this->payload($response);

        $this->assertSame(0, $body['code']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $body['data']['token']);
        $this->assertSame(1, AdminSession::count());

        $log = \think\facade\Db::name('op_log')->where('module', 'auth')->find();
        $this->assertNotEmpty($log, '登录成功应写入审计日志');
        $this->assertSame(1, (int) $log['result']);
        $this->assertSame('admin', $log['admin_name']);
    }

    public function testFailedLoginIsAuditedWithoutLeakingExistence(): void
    {
        // 账号不存在：文案与账号存在时一致（1004），且审计 admin_id=0
        $this->seedAdmin('exist-admin');
        $service = new AuthService();

        $missing = $this->payload($service->login('ghost-admin', 'whatever', '203.0.113.13', 'phpunit'));
        $wrongPw = $this->payload($service->login('exist-admin', 'whatever', '203.0.113.14', 'phpunit'));

        $this->assertSame(1004, (int) $missing['code']);
        $this->assertSame(1004, (int) $wrongPw['code']);
        $this->assertSame($missing['message'], $wrongPw['message'], '不得泄露账号是否存在');

        $failLogs = \think\facade\Db::name('op_log')->where('module', 'auth')->where('result', 0)->select()->toArray();
        $this->assertCount(2, $failLogs);
        foreach ($failLogs as $log) {
            $this->assertSame(0, (int) $log['admin_id']);
        }
    }
}
