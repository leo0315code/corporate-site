<?php
declare(strict_types=1);

namespace tests\Unit;

use tests\TestCase;
use think\facade\Config;

/**
 * 公共函数用例：密码生成 / 后台路径归一化 / 错误码 → HTTP 状态
 */
final class HelpersTest extends TestCase
{
    public function testRandomStrongPasswordMeetsPolicy(): void
    {
        $pwd = random_strong_password(12);

        $this->assertGreaterThanOrEqual(12, mb_strlen($pwd), '长度不得小于 12');
        $this->assertMatchesRegularExpression('/[A-Z]/', $pwd, '缺少大写字母');
        $this->assertMatchesRegularExpression('/[a-z]/', $pwd, '缺少小写字母');
        $this->assertMatchesRegularExpression('/\d/', $pwd, '缺少数字');
        $this->assertMatchesRegularExpression('/[^A-Za-z0-9]/', $pwd, '缺少符号');
        // 剔除易混淆字符
        $this->assertDoesNotMatchRegularExpression('/[IlO01o]/', $pwd);
        // CSPRNG：连续两次不应相同
        $this->assertNotSame($pwd, random_strong_password(12));
    }

    public function testRandomStrongPasswordEnforcesMinimumLength(): void
    {
        // 传入过小长度时按 12 处理（PRD 6.6）
        $this->assertGreaterThanOrEqual(12, mb_strlen(random_strong_password(4)));
    }

    public function testCmsPathNormalization(): void
    {
        $original = Config::get('cms');

        foreach ([
            'manage-x7k2'  => '/manage-x7k2',
            '/manage-x7k2' => '/manage-x7k2',
            '/manage-x7k2/' => '/manage-x7k2',
            '  /a/b/  '    => '/a/b',
            ''             => '',
        ] as $raw => $expected) {
            Config::set(array_merge($original, ['path' => $raw]), 'cms');
            $this->assertSame($expected, cms_path(), "归一化失败：{$raw}");
        }

        Config::set($original, 'cms');
    }

    public function testHttpStatusMapping(): void
    {
        $expected = [
            0    => 200,
            1001 => 400,
            1002 => 409,
            1003 => 401,
            1004 => 401,
            1005 => 423,
            1006 => 403,
            1007 => 400,
            1008 => 429,
            4004 => 404,
            5000 => 500,
            9999 => 400,
        ];

        foreach ($expected as $code => $status) {
            $this->assertSame($status, http_status_of($code), "业务码 {$code} 状态码不符");
        }
    }

    public function testFailResponseCarriesBusinessCodeAndHttpStatus(): void
    {
        $response = fail(1003, '请先登录');

        $this->assertSame(401, $response->getCode());
        $body = $this->payload($response);
        $this->assertSame(1003, $body['code']);
        $this->assertSame('请先登录', $body['message']);
        $this->assertNull($body['data']);
    }

    public function testSuccessResponseIs200(): void
    {
        $response = success(['ok' => true]);

        $this->assertSame(200, $response->getCode());
        $this->assertSame(0, $this->payload($response)['code']);
    }
}
