<?php
declare(strict_types=1);

namespace tests\Unit;

use app\middleware\MessageThrottle;
use tests\TestCase;
use think\facade\Cache;
use think\facade\Config;
use think\Request;

/**
 * 留言限流中间件用例
 *
 * 直接驱动中间件（不经 HTTP），验证：
 * - 窗口内未超限放行；
 * - 超限返回 1008 / HTTP 429；
 * - 阈值与窗口可配置；
 * - 不同 IP 互不影响。
 */
final class MessageThrottleTest extends TestCase
{
    private const IP = '203.0.113.7';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::clear();
    }

    private function request(string $ip = self::IP): Request
    {
        $request = new Request();
        $request->setMethod('POST');
        $request->withServer(['REMOTE_ADDR' => $ip]);

        return $request;
    }

    private function next(): \Closure
    {
        return static fn () => success(['reached' => true]);
    }

    public function testAllowsRequestsWithinLimit(): void
    {
        $middleware = new MessageThrottle();

        for ($i = 1; $i <= 5; $i++) {
            $response = $middleware->handle($this->request(), $this->next());
            $this->assertSame(200, $response->getCode(), "第 {$i} 次应放行");
        }
    }

    public function testBlocksWhenLimitExceeded(): void
    {
        $middleware = new MessageThrottle();

        for ($i = 1; $i <= 5; $i++) {
            $middleware->handle($this->request(), $this->next());
        }

        $response = $middleware->handle($this->request(), $this->next());

        $this->assertSame(429, $response->getCode(), '超限应返回 HTTP 429');
        $body = $this->payload($response);
        $this->assertSame(1008, $body['code']);
    }

    public function testLimitIsConfigurable(): void
    {
        $original = Config::get('cms');
        Config::set(array_merge($original, ['message_rate_max' => 1, 'message_rate_window' => 60]), 'cms');

        $middleware = new MessageThrottle();
        $this->assertSame(200, $middleware->handle($this->request('198.51.100.9'), $this->next())->getCode());
        $this->assertSame(429, $middleware->handle($this->request('198.51.100.9'), $this->next())->getCode());

        Config::set($original, 'cms');
    }

    public function testDifferentIpsAreIsolated(): void
    {
        $middleware = new MessageThrottle();

        for ($i = 1; $i <= 5; $i++) {
            $middleware->handle($this->request('198.51.100.1'), $this->next());
        }

        $this->assertSame(
            429,
            $middleware->handle($this->request('198.51.100.1'), $this->next())->getCode()
        );
        $this->assertSame(
            200,
            $middleware->handle($this->request('198.51.100.2'), $this->next())->getCode(),
            '另一个 IP 不应受限'
        );
    }
}
