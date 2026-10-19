<?php
declare(strict_types=1);

namespace tests\Feature;

use app\model\AdminUser;
use app\service\AdminService;
use app\service\OpLogContext;
use tests\TestCase;
use think\facade\Db;

/**
 * 账号角色用例（RBAC 写路径）
 *
 * 覆盖：非法角色拒绝、建号落角色、改角色成功并审计、不得改自己、
 * 主账号不可降级、最后一名超管不可降级、同角色幂等不写噪声日志。
 */
final class AdminRoleTest extends TestCase
{
    private function ctx(int $adminId = 1): OpLogContext
    {
        return new OpLogContext($adminId, 'actor', '127.0.0.1', 'phpunit');
    }

    private function seed(string $username, string $role, int $isPrimary = 0, int $status = 1): AdminUser
    {
        $user = AdminUser::createAccount($username, 'Init#12345678', $role);
        $user->save(['is_primary' => $isPrimary, 'status' => $status]);

        return $user;
    }

    public function testCreateRejectsInvalidRole(): void
    {
        $res = (new AdminService())->create('role_bad', 'root', $this->ctx());

        $this->assertSame(1001, $this->payload($res)['code']);
        $this->assertNull(AdminUser::findByUsername('role_bad'), '非法角色不得落库');
    }

    public function testCreateStoresRole(): void
    {
        $res  = (new AdminService())->create('role_new', 'editor', $this->ctx());
        $body = $this->payload($res);

        $this->assertSame(0, $body['code']);
        $this->assertSame('editor', $body['data']['role']);

        $user = AdminUser::findByUsername('role_new');
        $this->assertNotNull($user);
        $this->assertSame('editor', (string) $user->getData('role'));
        $this->assertNotEmpty($body['data']['password'], '一次性密码必须返回');
    }

    public function testChangeRoleUpdatesAndWritesAudit(): void
    {
        $actor  = $this->seed('role_actor', 'admin', 1);
        $target = $this->seed('role_target', 'viewer');

        $res = (new AdminService())->changeRole((int) $target->id, 'editor', $this->ctx((int) $actor->id));

        $this->assertSame(0, $this->payload($res)['code']);
        $this->assertSame('editor', (string) AdminUser::find($target->id)->getData('role'));

        $log = Db::name('op_log')->where('module', 'account')->select()->toArray()[0];
        $this->assertSame(1, (int) $log['result'], '成功操作 result 应为 1');
        $this->assertStringContainsString('只读运营', (string) $log['detail']);
        $this->assertStringContainsString('内容编辑', (string) $log['detail']);
    }

    public function testChangeRoleRejectsSelf(): void
    {
        $actor = $this->seed('role_self', 'admin', 1);

        $res = (new AdminService())->changeRole((int) $actor->id, 'viewer', $this->ctx((int) $actor->id));

        $this->assertSame(1001, $this->payload($res)['code']);
        $this->assertSame('admin', (string) AdminUser::find($actor->id)->getData('role'));
    }

    public function testChangeRoleKeepsPrimaryAdminAsAdmin(): void
    {
        $actor   = $this->seed('role_actor2', 'admin');
        $primary = $this->seed('role_primary', 'admin', 1);

        $res = (new AdminService())->changeRole((int) $primary->id, 'editor', $this->ctx((int) $actor->id));

        $this->assertSame(1001, $this->payload($res)['code']);
        $this->assertSame('admin', (string) AdminUser::find($primary->id)->getData('role'));
    }

    public function testChangeRoleKeepsAtLeastOneEnabledAdmin(): void
    {
        $onlyAdmin = $this->seed('role_only', 'admin');
        $other     = $this->seed('role_other', 'editor');

        $res = (new AdminService())->changeRole((int) $onlyAdmin->id, 'viewer', $this->ctx((int) $other->id));

        $this->assertSame(1001, $this->payload($res)['code']);
        $this->assertSame('admin', (string) AdminUser::find($onlyAdmin->id)->getData('role'), '最后一名超管不可降级');
    }

    public function testChangeRoleIsIdempotent(): void
    {
        $actor  = $this->seed('role_actor3', 'admin');
        $target = $this->seed('role_same', 'viewer');

        $res = (new AdminService())->changeRole((int) $target->id, 'viewer', $this->ctx((int) $actor->id));

        $this->assertSame(0, $this->payload($res)['code']);
        $this->assertSame(0, Db::name('op_log')->count(), '无变化不写噪声日志');
    }
}
