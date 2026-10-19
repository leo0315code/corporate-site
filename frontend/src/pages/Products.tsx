import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import Card from '@/components/common/Card';
import ProductIcon from '@/components/common/ProductIcon';
import { SectionEmpty, SectionError, SkeletonCard, DegradedNotice } from '@/components/common/AsyncState';
import ThumbImage from '@/components/ThumbImage';
import { useContent } from '@/hooks/useContent';
import { fetchProductList } from '@/services/api';
import products from '@/data/products';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { ROUTES } from '@/constants';
import type { PagedData, Product } from '@/types';

/** 全部分类选项的固定标识 */
const ALL_CATEGORY = '全部';

/** 降级数据（接口失败时兜底，结构对齐 fetchProductList 返回） */
const FALLBACK_PRODUCTS: PagedData<Product> = {
  total: products.length,
  page: 1,
  size: products.length,
  items: products,
};

/**
 * 产品服务列表页：
 * - 页面标题横幅（静态）
 * - 分类 Tab 筛选（客户端筛选，基于接口返回的全量列表）
 * - 卡片网格（响应式 1/2/3 列），点击进入详情
 * - 三态：加载骨架 / 错误 + 重试 / 空态
 */
export default function Products() {
  const { siteConfig } = useSiteConfig();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);

  // 列表数据走 API（size=50 覆盖全量）；失败降级到本地数据
  const { data, loading, error, retry } = useContent<PagedData<Product>>(
    'product-list',
    () => fetchProductList({ size: 50 }),
    FALLBACK_PRODUCTS,
  );

  const items = useMemo(() => data?.items ?? [], [data]);

  const categories = useMemo(() => {
    const set = new Set(items.map((item) => item.category));
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) {
      return items;
    }
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  return (
    <>
      <SEO
        title="产品服务"
        description={`${siteConfig.companyName}的产品与服务：${items
          .map((item) => item.name)
          .slice(0, 5)
          .join('、')}等。`}
        keywords={`${siteConfig.seo.keywords},产品服务,解决方案`}
      />

      <PageHero
        title="产品服务"
        subtitle="围绕企业数字化的关键场景，提供成熟、可落地的产品与解决方案"
        breadcrumb={[{ label: '产品服务' }]}
      />

      <section className="section-padding">
        <Container>
          {/* 降级轻提示：接口失败但已用本地数据兜底 */}
          {error && items.length > 0 ? (
            <div className="mb-8">
              <DegradedNotice onRetry={retry} />
            </div>
          ) : null}

          {/* 分类筛选（数据到达后展示；加载中隐藏，避免空 Tab 闪烁） */}
          {!loading && filtered.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {categories.map((category) => {
                const isActive = category === activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`rounded-btn px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-border bg-white text-text-secondary hover:border-primary hover:text-primary'
                    }`}
                    aria-pressed={isActive}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* 产品网格（三态） */}
          {loading ? (
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((slot) => (
                <SkeletonCard key={slot} />
              ))}
            </div>
          ) : items.length === 0 ? (
            error ? (
              <SectionError onRetry={retry} />
            ) : (
              <SectionEmpty text="暂无产品服务。" />
            )
          ) : (
            <>
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((product) => (
                  <Card key={product.id} hoverable noPadding className="flex flex-col">
                    <Link
                      to={ROUTES.PRODUCT_DETAIL(product.id)}
                      className="group flex h-full flex-col"
                    >
                      <div className="aspect-[16/10] overflow-hidden rounded-t-md bg-bg-soft">
                        <ThumbImage
                          src={product.image}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-light text-primary">
                            <ProductIcon name={product.icon} className="h-5 w-5" />
                          </span>
                          <span className="rounded-full bg-bg-soft px-3 py-1 text-xs font-medium text-text-secondary">
                            {product.category}
                          </span>
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-secondary transition-colors group-hover:text-primary">
                          {product.name}
                        </h3>
                        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-text-secondary">
                          {product.summary}
                        </p>
                        <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                          查看详情
                          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                            <path
                              d="M4 10h12M11 5l5 5-5 5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </div>
                    </Link>
                  </Card>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div className="mt-16 text-center text-text-secondary">
                  该分类下暂无产品服务。
                </div>
              ) : null}
            </>
          )}
        </Container>
      </section>
    </>
  );
}
