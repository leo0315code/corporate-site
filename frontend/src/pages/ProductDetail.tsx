import { Link, useParams } from 'react-router-dom';
import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import ProductIcon from '@/components/common/ProductIcon';
import { SectionError, SkeletonBlock } from '@/components/common/AsyncState';
import { useContent } from '@/hooks/useContent';
import { fetchProductDetail, fetchProductList, ApiError } from '@/services/api';
import products from '@/data/products';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { ERROR_CODES, ROUTES } from '@/constants';
import type { PagedData, Product } from '@/types';

/** 列表降级数据（用于「同类推荐」，接口失败时兜底） */
const FALLBACK_PRODUCTS: PagedData<Product> = {
  total: products.length,
  page: 1,
  size: products.length,
  items: products,
};

/**
 * 产品详情页（/products/:id）：
 * - 主图 + 分类 + 标题 + 详细描述
 * - 特点列表
 * - CTA（咨询/留言）
 * - 非法 / 不存在 id（接口 4004）→ 现有「产品未找到」页；其他错误 → 错误 + 重试
 */
export default function ProductDetail() {
  const { siteConfig } = useSiteConfig();
  const { id = '' } = useParams<{ id: string }>();

  const { data: product, loading, error, retry } = useContent<Product>(
    `product-detail:${id}`,
    () => fetchProductDetail(id),
  );

  // 同类推荐数据源（复用 list 缓存；失败降级到本地数据）
  const { data: listData } = useContent<PagedData<Product>>(
    'product-list',
    () => fetchProductList({ size: 50 }),
    FALLBACK_PRODUCTS,
  );

  const isNotFound =
    error instanceof ApiError && error.code === ERROR_CODES.NOT_FOUND;

  // 加载中：占位骨架（PageHero 静态，保证首屏不白屏）
  if (loading) {
    return (
      <>
        <SEO title="产品服务" description="正在加载产品详情…" />
        <PageHero
          title="产品服务"
          breadcrumb={[{ label: '产品服务', path: ROUTES.PRODUCTS }, { label: '加载中' }]}
        />
        <section className="section-padding">
          <Container className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
            <div className="aspect-[16/10] animate-pulse rounded-lg bg-border" />
            <div>
              <SkeletonBlock lines={6} />
            </div>
          </Container>
        </section>
      </>
    );
  }

  // 非「未找到」的加载错误：错误 + 重试
  if (error && !isNotFound) {
    return (
      <>
        <SEO title="产品服务" description="产品详情加载失败。" />
        <PageHero
          title="产品服务"
          breadcrumb={[{ label: '产品服务', path: ROUTES.PRODUCTS }, { label: '加载失败' }]}
        />
        <section className="section-padding">
          <Container>
            <SectionError onRetry={retry} />
          </Container>
        </section>
      </>
    );
  }

  // 未找到（接口 4004 或数据为空）：友好提示
  if (!product) {
    return (
      <>
        <SEO title="产品未找到" description="您访问的产品不存在或已被移除。" />
        <PageHero
          title="产品未找到"
          subtitle="您访问的产品不存在或已被移除"
          breadcrumb={[{ label: '产品服务', path: ROUTES.PRODUCTS }, { label: '未找到' }]}
        />
        <section className="section-padding">
          <Container className="flex flex-col items-center text-center">
            <p className="text-base text-text-secondary">
              很抱歉，未找到对应的产品服务。它可能已被移除或链接有误。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button to={ROUTES.PRODUCTS} variant="primary" size="lg">
                返回产品列表
              </Button>
              <Button to={ROUTES.CONTACT} variant="outline" size="lg">
                联系我们
              </Button>
            </div>
          </Container>
        </section>
      </>
    );
  }

  // 同类推荐（排除当前产品，最多 3 条）
  const related = (listData?.items ?? []).filter(
    (item) => item.category === product.category && item.id !== product.id,
  ).slice(0, 3);

  return (
    <>
      <SEO
        title={product.name}
        description={product.summary}
        keywords={`${product.name},${product.category},${siteConfig.seo.keywords}`}
      />

      <PageHero
        title={product.name}
        subtitle={product.summary}
        breadcrumb={[{ label: '产品服务', path: ROUTES.PRODUCTS }, { label: product.name }]}
      />

      {/* 主图 + 详情 */}
      <section className="section-padding">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <div className="overflow-hidden rounded-lg border border-border bg-bg-soft">
            <img
              src={product.image}
              alt={product.name}
              className="aspect-[16/10] h-full w-full object-cover"
            />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-light text-primary">
                <ProductIcon name={product.icon} className="h-6 w-6" />
              </span>
              <span className="rounded-full bg-bg-soft px-4 py-1.5 text-sm font-medium text-text-secondary">
                {product.category}
              </span>
            </div>

            <h2 className="mt-6 text-h3 font-bold text-secondary">{product.name}</h2>

            <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-text-secondary">
              {product.description}
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Button to={ROUTES.CONTACT} variant="primary" size="lg">
                立即咨询
              </Button>
              <Button to={ROUTES.PRODUCTS} variant="outline" size="lg">
                返回列表
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* 核心特点 */}
      {product.features.length > 0 ? (
        <section className="section-padding bg-bg-soft">
          <Container>
            <h2 className="text-h3 font-bold text-secondary">核心特点</h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {product.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-4 rounded-md border border-border bg-white p-6 shadow-sm"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                      <path
                        d="M5 10.5l3.5 3.5L15 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-base text-text">{feature}</span>
                </div>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {/* 同类推荐 */}
      {related.length > 0 ? (
        <section className="section-padding">
          <Container>
            <h2 className="text-h3 font-bold text-secondary">相关产品服务</h2>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <Card key={item.id} hoverable noPadding>
                  <Link to={ROUTES.PRODUCT_DETAIL(item.id)} className="group flex flex-col">
                    <div className="aspect-[16/10] overflow-hidden rounded-t-md bg-bg-soft">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-6">
                      <h3 className="text-base font-semibold text-secondary transition-colors group-hover:text-primary">
                        {item.name}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                        {item.summary}
                      </p>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          </Container>
        </section>
      ) : null}
    </>
  );
}
