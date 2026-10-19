<?php
declare(strict_types=1);

namespace tests\Feature;

use app\model\Message;
use app\service\MessageService;
use tests\TestCase;

/**
 * 留言提交用例
 *
 * 覆盖：合法提交、幂等去重、服务端校验拦截、超长内容不落库。
 */
final class MessageSubmitTest extends TestCase
{
    private function payloadValid(array $override = []): array
    {
        return array_merge([
            'name'    => '李四',
            'company' => '示例科技',
            'phone'   => '13900139000',
            'email'   => 'lisi@example.com',
            'content' => '想咨询企业官网定制的交付周期。',
        ], $override);
    }

    public function testValidSubmitPersists(): void
    {
        $response = (new MessageService())->submit($this->payloadValid(), '203.0.113.20');
        $body     = $this->payload($response);

        $this->assertSame(0, $body['code']);
        $this->assertSame(200, $response->getCode());
        $this->assertSame(1, Message::count());
        $this->assertSame(0, (int) Message::find(1)->status, '新留言默认待处理');
    }

    public function testDuplicateWithinWindowIsIdempotent(): void
    {
        $service = new MessageService();
        $data    = $this->payloadValid();

        $first  = $this->payload($service->submit($data, '203.0.113.21'));
        $second = $this->payload($service->submit($data, '203.0.113.21'));

        $this->assertSame(0, $first['code']);
        $this->assertSame(0, $second['code'], '重复提交应幂等返回成功');
        $this->assertSame(1, Message::count(), '重复提交不得重复入库');
    }

    public function testInvalidPayloadRejected(): void
    {
        $response = (new MessageService())->submit($this->payloadValid(['phone' => '', 'email' => '']), '203.0.113.22');
        $body     = $this->payload($response);

        $this->assertSame(1001, $body['code']);
        $this->assertSame(400, $response->getCode());
        $this->assertSame(0, Message::count());
    }

    public function testOverlongContentRejectedBeforeTruncation(): void
    {
        // 先校验后截断：超长内容必须被拒，而不是被裁成合法长度后入库
        $response = (new MessageService())->submit(
            $this->payloadValid(['content' => str_repeat('长', 501)]),
            '203.0.113.23'
        );

        $this->assertSame(1001, $this->payload($response)['code']);
        $this->assertSame(0, Message::count());
    }
}
