<?php
declare(strict_types=1);

namespace tests\Unit;

use app\middleware\Cors;
use tests\TestCase;
use think\Request;

/**
 * CORS 白名单用例：命中回显来源，未命中不下发 CORS 头（不再回退 `*`）
 */
final class CorsTest extends TestCase
{
    private function request(string $origin): Request
    {
        $request = new Request();
        $request->withServer(['REQUEST_METHOD' => 'GET']);
        $request->withHeader(['origin' => $origin]);

        return $request;
    }

    public function testAllowedOriginIsEchoed(): void
    {
        $response = (new Cors())->handle($this->request('http://localhost:5173'), static fn () => success());

        $this->assertSame('http://localhost:5173', $response->getHeader('Access-Control-Allow-Origin'));
        $this->assertSame('true', $response->getHeader('Access-Control-Allow-Credentials'));
        $this->assertSame('Origin', $response->getHeader('Vary'));
    }

    public function testDisallowedOriginGetsNoCorsHeader(): void
    {
        $response = (new Cors())->handle($this->request('https://evil.example'), static fn () => success());

        $this->assertSame('', (string) $response->getHeader('Access-Control-Allow-Origin'), '未命中白名单不得回通配来源');
        $this->assertSame(200, $response->getCode());
    }

    public function testRequestWithoutOriginIsUntouched(): void
    {
        $request = new Request();
        $request->withServer(['REQUEST_METHOD' => 'GET']);

        $response = (new Cors())->handle($request, static fn () => success());

        $this->assertSame('', (string) $response->getHeader('Access-Control-Allow-Origin'));
    }

    public function testPreflightReturns204(): void
    {
        $request = new Request();
        $request->withServer(['REQUEST_METHOD' => 'OPTIONS']);
        $request->withHeader(['origin' => 'http://127.0.0.1:5173']);

        $response = (new Cors())->handle($request, static fn () => success());

        $this->assertSame(204, $response->getCode());
        $this->assertSame('http://127.0.0.1:5173', $response->getHeader('Access-Control-Allow-Origin'));
    }
}
