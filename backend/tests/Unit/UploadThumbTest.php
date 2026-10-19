<?php
declare(strict_types=1);

namespace tests\Unit;

use app\service\UploadService;
use PHPUnit\Framework\TestCase;

/**
 * 上传派生图命名约定（纯字符串逻辑，不依赖 GD）
 */
class UploadThumbTest extends TestCase
{
    public function testThumbNameKeepsBaseNameAndSwitchesToWebp(): void
    {
        self::assertSame('9f3c1a_thumb.webp', UploadService::thumbName('9f3c1a.png'));
        self::assertSame('abc_thumb.webp', UploadService::thumbName('abc.jpeg'));
        self::assertSame('noext_thumb.webp', UploadService::thumbName('noext'));
    }

    public function testThumbRelativeOfKeepsDirectory(): void
    {
        self::assertSame(
            '/uploads/product/9f3c1a_thumb.webp',
            UploadService::thumbRelativeOf('/uploads/product/9f3c1a.png')
        );
        self::assertSame(
            '/uploads/common/a_thumb.webp',
            UploadService::thumbRelativeOf('/uploads/common/a.webp')
        );
    }

    public function testSuffixContractIsStable(): void
    {
        // 前端 thumbUrl() 依赖该后缀，改动会静默导致 404
        self::assertSame('_thumb.webp', UploadService::THUMB_SUFFIX);
    }
}
