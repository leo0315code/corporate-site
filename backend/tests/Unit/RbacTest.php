<?php
declare(strict_types=1);

namespace tests\Unit;

use app\service\Rbac;
use PHPUnit\Framework\TestCase;

/**
 * RBAC 判定用例（固定三角色 + 模块级权限）
 *
 * 覆盖：角色矩阵、通配符展开、未知角色降级、控制器/action → 模块与读写类型解析。
 */
final class RbacTest extends TestCase
{
    public function testAdminHasEveryModule(): void
    {
        foreach (Rbac::MODULES as $module) {
            $this->assertTrue(Rbac::allows('admin', $module, Rbac::READ), "admin 应可读 {$module}");
            $this->assertTrue(Rbac::allows('admin', $module, Rbac::WRITE), "admin 应可写 {$module}");
        }
    }

    public function testEditorCanWriteContentButNotAccountsOrLogs(): void
    {
        foreach (['product', 'news', 'case', 'advantage', 'about', 'site', 'message'] as $module) {
            $this->assertTrue(Rbac::allows('editor', $module, Rbac::WRITE), "editor 应可写 {$module}");
        }
        $this->assertFalse(Rbac::allows('editor', 'account', Rbac::READ), 'editor 不得进入账号管理');
        $this->assertFalse(Rbac::allows('editor', 'oplog', Rbac::READ), 'editor 不得查看操作日志');
    }

    public function testViewerIsReadOnly(): void
    {
        $this->assertTrue(Rbac::allows('viewer', 'product', Rbac::READ));
        $this->assertFalse(Rbac::allows('viewer', 'product', Rbac::WRITE), 'viewer 不得写入');
        $this->assertFalse(Rbac::allows('viewer', 'account', Rbac::READ));
        $this->assertFalse(Rbac::allows('viewer', 'oplog', Rbac::READ));
    }

    public function testUnknownRoleFallsBackToViewer(): void
    {
        $this->assertSame('viewer', Rbac::roleOf('root'));
        $this->assertSame('viewer', Rbac::roleOf(null));
        $this->assertSame('viewer', Rbac::roleOf(''));
        $this->assertFalse(Rbac::allows('root', 'product', Rbac::WRITE));
    }

    public function testPermissionListIsExpandedAndSorted(): void
    {
        $admin = Rbac::permissionsOf('admin');
        $this->assertContains('account.write', $admin);
        $this->assertContains('oplog.read', $admin);
        $this->assertSame(count(Rbac::MODULES) * 2, count($admin));

        $viewer = Rbac::permissionsOf('viewer');
        $this->assertContains('product.read', $viewer);
        $this->assertNotContains('product.write', $viewer);

        // 排序稳定，便于前端缓存与快照比对
        $sorted = $viewer;
        sort($sorted);
        $this->assertSame($sorted, $viewer);
    }

    public function testModuleResolution(): void
    {
        // 聚合控制器：按 action 前缀解析
        $this->assertSame('product', Rbac::moduleOf('Content', 'productSave'));
        $this->assertSame('site', Rbac::moduleOf('Content', 'siteDetail'));
        $this->assertSame('advantage', Rbac::moduleOf('Content', 'advantageDelete'));
        // 独立控制器
        $this->assertSame('account', Rbac::moduleOf('Admin', 'adminList'));
        $this->assertSame('oplog', Rbac::moduleOf('OpLog', 'list'));
        $this->assertSame('upload', Rbac::moduleOf('Upload', 'image'));
        // 自助接口不纳入 RBAC
        $this->assertNull(Rbac::moduleOf('Auth', 'changePassword'));
    }

    public function testActionType(): void
    {
        $this->assertSame(Rbac::READ, Rbac::actionType('productList'));
        $this->assertSame(Rbac::READ, Rbac::actionType('siteDetail'));
        $this->assertSame(Rbac::READ, Rbac::actionType('profile'));
        $this->assertSame(Rbac::WRITE, Rbac::actionType('productSave'));
        $this->assertSame(Rbac::WRITE, Rbac::actionType('adminDelete'));
        $this->assertSame(Rbac::WRITE, Rbac::actionType('image'));
    }
}
