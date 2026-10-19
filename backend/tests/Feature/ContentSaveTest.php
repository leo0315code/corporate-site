<?php
declare(strict_types=1);

namespace tests\Feature;

use app\service\ContentService;
use tests\TestCase;
use think\facade\Db;

/**
 * 内容保存用例（slug 主键不可变）
 *
 * 覆盖：编辑命中正常保存、编辑命中不到 → 4004 且不新建、新增 id 冲突 → 1001。
 */
final class ContentSaveTest extends TestCase
{
    /** 构造一条合法的产品 payload */
    private function productPayload(string $id): array
    {
        return [
            'id'          => $id,
            'category'    => '解决方案',
            'name'        => '云原生解决方案',
            'summary'     => '一句话摘要',
            'description' => '详情正文',
            'features'    => ['特性一', '特性二'],
            'image'       => '',
            'icon'        => 'cloud',
        ];
    }

    public function testCreateThenEditKeepsSameId(): void
    {
        $service = new ContentService();

        $created = $this->payload($service->save('product', $this->productPayload('p-1')));
        $this->assertSame(0, $created['code']);

        $payload            = $this->productPayload('p-1');
        $payload['name']    = '改名后的产品';
        $payload['_editing'] = true;
        $updated            = $this->payload($service->save('product', $payload));

        $this->assertSame(0, $updated['code']);
        $this->assertSame(1, (int) Db::name('product')->count());
        $this->assertSame('改名后的产品', Db::name('product')->where('id', 'p-1')->value('name'));
    }

    public function testEditWithUnknownIdIsRejectedInsteadOfUpsert(): void
    {
        $service = new ContentService();
        $service->save('product', $this->productPayload('p-1'));

        // 模拟「后台把 id 改掉」：编辑态 + 新 id（库中不存在）
        $payload             = $this->productPayload('p-renamed');
        $payload['_editing'] = true;
        $result              = $this->payload($service->save('product', $payload));

        $this->assertSame(4004, $result['code'], '编辑命中不到应立即报错');
        $this->assertSame(1, (int) Db::name('product')->count(), '不得静默新建');
        $this->assertNull(Db::name('product')->where('id', 'p-renamed')->find(), '新 id 不应落库');
    }

    public function testCreateWithExistingIdIsRejected(): void
    {
        $service = new ContentService();
        $service->save('product', $this->productPayload('p-1'));

        $result = $this->payload($service->save('product', $this->productPayload('p-1')));

        $this->assertSame(1001, $result['code']);
        $this->assertSame(1, (int) Db::name('product')->count());
    }
}
