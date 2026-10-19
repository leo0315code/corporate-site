import Container from '@/components/common/Container';
import Button from '@/components/common/Button';
import SEO from '@/components/common/SEO';
import { ROUTES } from '@/constants';

/**
 * 404 页面：友好的未找到提示 + 返回首页 / 产品入口。
 */
export default function NotFound() {
  return (
    <>
      <SEO title="页面未找到" description="您访问的页面不存在或已被移除。" />
      <section className="section-padding">
        <Container className="flex flex-col items-center text-center">
          <span className="text-[80px] font-bold leading-none text-primary-light md:text-[120px]">
            404
          </span>
          <h1 className="mt-2 text-h3 font-bold text-secondary md:text-h2">
            抱歉，页面走丢了
          </h1>
          <p className="mt-4 max-w-md text-base text-text-secondary">
            您访问的页面不存在或已被移除，请检查网址是否正确，或返回首页继续浏览。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button to={ROUTES.HOME} variant="primary" size="lg">
              返回首页
            </Button>
            <Button to={ROUTES.PRODUCTS} variant="outline" size="lg">
              浏览产品服务
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
