<?php
declare(strict_types=1);

namespace tests\Unit;

use app\command\CmsInit;
use tests\TestCase;
use think\console\Input;
use think\facade\Config;

/**
 * `cms:init` 初始管理员账号名 / 密码解析用例
 *
 * 覆盖：缺省账号名随机且合规（不再固定 admin）、--username 生效、
 * 非法账号名拒绝、弱密码拒绝、强密码放行、缺省密码满足强度策略。
 */
final class CmsInitOptionsTest extends TestCase
{
    /**
     * 以反射调用 protected 解析方法（避免为测试放宽可见性）
     *
     * @param string $method 方法名（resolveUsername / resolvePassword）
     * @param array<int, string> $argv 命令行 token（如 ['--username=ops_admin']）
     * @return string
     */
    private function resolve(string $method, array $argv = []): string
    {
        $cmd   = new CmsInit();
        $input = new Input($argv);
        $input->bind($cmd->getDefinition());

        $ref = new \ReflectionMethod($cmd, $method);
        $ref->setAccessible(true);

        /** @var string $value */
        $value = $ref->invoke($cmd, $input);

        return $value;
    }

    public function testDefaultUsernameIsRandomNotAdmin(): void
    {
        $first  = $this->resolve('resolveUsername');
        $second = $this->resolve('resolveUsername');

        $this->assertNotSame('admin', $first, '缺省账号名不得再固定为 admin');
        $this->assertNotSame($first, $second, '缺省账号名应为随机值');
        // 与 AdminValidate::adminCreate 同规则：字母开头，3~50 位
        $this->assertMatchesRegularExpression('/^[A-Za-z][A-Za-z0-9_-]{2,49}$/', $first);
    }

    public function testExplicitUsernameIsUsed(): void
    {
        $this->assertSame('ops_admin', $this->resolve('resolveUsername', ['--username=  ops_admin  ']));
    }

    public function testInvalidUsernameIsRejected(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('账号名不合法');

        $this->resolve('resolveUsername', ['--username=1bad']);
    }

    public function testWeakPasswordIsRejected(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('密码强度不足');

        $this->resolve('resolvePassword', ['--password=abc123']);
    }

    public function testStrongPasswordIsAccepted(): void
    {
        $this->assertSame('Init#2026abcd', $this->resolve('resolvePassword', ['--password=Init#2026abcd']));
    }

    public function testDefaultPasswordMeetsPolicy(): void
    {
        $this->assertNull(password_policy_error($this->resolve('resolvePassword')));
    }

    /**
     * 临时改写配置的库名并在结束后还原
     * @param string $dbName 目标库名
     * @return array<string, mixed> 修改前的完整 database 配置（供 finally 还原）
     */
    private function withDatabase(string $dbName): array
    {
        /** @var array<string, mixed> $original */
        $original = config('database');

        $conf = $original;
        $conf['connections']['mysql']['database'] = $dbName;

        // 注意：TP8 的 Config::set() **不支持点号嵌套**，必须整块写入 'database'
        Config::set($conf, 'database');

        return $original;
    }

    /**
     * 调用 protected applyDatabaseName
     * @param string $sql 原始脚本
     * @return string
     */
    private function applyDatabaseName(string $sql): string
    {
        $cmd = new CmsInit();
        $ref = new \ReflectionMethod($cmd, 'applyDatabaseName');
        $ref->setAccessible(true);

        /** @var string $result */
        $result = $ref->invoke($cmd, $sql);

        return $result;
    }

    public function testDatabaseNameIsRewrittenToConfiguredOne(): void
    {
        $original = config('database');

        try {
            $this->withDatabase('shop_prod');

            $sql = "CREATE DATABASE IF NOT EXISTS `corporate_site`\n"
                . "  DEFAULT CHARACTER SET utf8mb4;\n"
                . "USE `corporate_site`;\n"
                . "CREATE TABLE IF NOT EXISTS `admin_user` (`id` INT);\n"
                . "-- 注释里的 corporate_site 不应被改写\n";

            $out = $this->applyDatabaseName($sql);

            $this->assertStringContainsString('CREATE DATABASE IF NOT EXISTS `shop_prod`', $out);
            $this->assertStringContainsString('USE `shop_prod`;', $out);
            $this->assertStringNotContainsString('USE `corporate_site`', $out);
            $this->assertStringContainsString('`admin_user`', $out, '表名不得被误改');
            $this->assertStringContainsString('注释里的 corporate_site', $out, '注释不得被误改');
        } finally {
            Config::set($original, 'database');
        }
    }

    public function testDatabaseNameUnchangedWhenSame(): void
    {
        $original = config('database');

        try {
            $this->withDatabase('corporate_site');

            $sql = "CREATE DATABASE IF NOT EXISTS `corporate_site`;\nUSE `corporate_site`;";

            $this->assertSame($sql, $this->applyDatabaseName($sql));
        } finally {
            Config::set($original, 'database');
        }
    }

    public function testInvalidDatabaseNameIsRejected(): void
    {
        $original = config('database');

        try {
            $this->withDatabase('bad;DROP DATABASE x');

            $this->expectException(\RuntimeException::class);
            $this->expectExceptionMessage('数据库名不合法');

            $this->applyDatabaseName('USE `corporate_site`;');
        } finally {
            Config::set($original, 'database');
        }
    }
}
