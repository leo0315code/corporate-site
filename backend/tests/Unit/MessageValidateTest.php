<?php
declare(strict_types=1);

namespace tests\Unit;

use app\validate\MessageValidate;
use tests\TestCase;

/**
 * 留言校验器用例（跨字段「电话 / 邮箱至少一项」是最易回归的规则）
 */
final class MessageValidateTest extends TestCase
{
    private function check(array $data): bool
    {
        return (new MessageValidate())->scene('submit')->check($data);
    }

    private function base(array $override = []): array
    {
        return array_merge([
            'name'    => '张三',
            'company' => '示例科技',
            'phone'   => '13800138000',
            'email'   => 'zhangsan@example.com',
            'content' => '我想了解云原生解决方案的报价。',
        ], $override);
    }

    public function testValidPayloadPasses(): void
    {
        $this->assertTrue($this->check($this->base()));
    }

    public function testNameTooShortFails(): void
    {
        $this->assertFalse($this->check($this->base(['name' => '张'])));
    }

    public function testContentTooShortFails(): void
    {
        $this->assertFalse($this->check($this->base(['content' => '你好'])));
    }

    public function testPhoneAndEmailBothEmptyFails(): void
    {
        // 强制校验字段（$must）保证空值时仍执行跨字段规则
        $this->assertFalse($this->check($this->base(['phone' => '', 'email' => ''])));
    }

    public function testEmailOnlyPasses(): void
    {
        $this->assertTrue($this->check($this->base(['phone' => ''])));
    }

    public function testPhoneOnlyPasses(): void
    {
        $this->assertTrue($this->check($this->base(['email' => ''])));
    }

    public function testInvalidEmailFails(): void
    {
        $this->assertFalse($this->check($this->base(['email' => 'not-an-email'])));
    }

    public function testInvalidPhoneFails(): void
    {
        $this->assertFalse($this->check($this->base(['phone' => '12345'])));
    }

    public function testLandlineAccepted(): void
    {
        $this->assertTrue($this->check($this->base(['phone' => '010-88886666', 'email' => ''])));
    }

    public function testOverlongContentFails(): void
    {
        $this->assertFalse($this->check($this->base(['content' => str_repeat('测', 501)])));
    }
}
