import { Link } from 'react-router-dom';
import Container from '@/components/common/Container';
import SectionTitle from '@/components/common/SectionTitle';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import ProductIcon from '@/components/common/ProductIcon';
import { SectionEmpty, SectionError, SkeletonCard } from '@/components/common/AsyncState';
import { ROUTES } from '@/constants';
import type { Product } from '@/types';

export interface BusinessSectionProps {
  /** 产品数据（首页聚合已按 HOME_PRODUCT_LIMIT 截断，直接渲染不再二次截断） */
  products?: Product[];
  /** 是否加载中 */
  loading?: boolean;
  /** 加载错误（加载失败且无数据时展示错误 + 重试） */
  error?: unknown;
  /** 重试回调 */
  onRetry?: () => void;
}

/**
 * 首页核心业务概览：展示首页聚合返回的产品列表（图标 + 名称 + 简述），点击进入产品详情。
 * 三态：加载骨架 / 错误 + 重试 / 空态。
 */
export default function BusinessSection({
  products = [],
  loading = false,
  error = null,
  onRetry,
}: BusinessSectionProps) {
  return (
    <section className="section-padding">
      <Container>
        <SectionTitle
          eyebrow="核心业务"
          title="我们能为你做什么"
          subtitle="围绕企业数字化的关键环节，提供成熟可靠的产品与服务"
        />

        {loading ? (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <SkeletonCard key={slot} />
            ))}
          </div>
        ) : products.length === 0 ? (
          error ? (
            <SectionError onRetry={onRetry} />
          ) : (
            <SectionEmpty text="暂无产品服务" />
          )
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} hoverable noPadding className="flex flex-col">
                <Link
                  to={ROUTES.PRODUCT_DETAIL(product.id)}
                  className="group flex h-full flex-col p-6 md:p-8"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-md bg-primary-light text-primary">
                    <ProductIcon name={product.icon} className="h-7 w-7" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-secondary transition-colors group-hover:text-primary">
                    {product.name}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
                    {product.summary}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
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
                </Link>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <Button to={ROUTES.PRODUCTS} variant="outline" size="lg">
            查看全部产品服务
          </Button>
        </div>
      </Container>
    </section>
  );
}
