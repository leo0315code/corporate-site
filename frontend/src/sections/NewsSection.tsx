import { Link } from 'react-router-dom';
import Container from '@/components/common/Container';
import SectionTitle from '@/components/common/SectionTitle';
import Button from '@/components/common/Button';
import { SectionEmpty, SectionError } from '@/components/common/AsyncState';
import { ROUTES } from '@/constants';
import type { NewsItem } from '@/types';

export interface NewsSectionProps {
  /** 新闻数据（首页聚合已按 HOME_NEWS_LIMIT 截断，直接渲染不再二次截断） */
  news?: NewsItem[];
  /** 是否加载中 */
  loading?: boolean;
  /** 加载错误（加载失败且无数据时展示错误 + 重试） */
  error?: unknown;
  /** 重试回调 */
  onRetry?: () => void;
}

/**
 * 首页新闻摘要：展示首页聚合返回的新闻（封面 + 标题 + 日期 + 摘要），点击进入详情。
 * 三态：加载骨架 / 错误 + 重试 / 空态。
 */
export default function NewsSection({
  news = [],
  loading = false,
  error = null,
  onRetry,
}: NewsSectionProps) {
  return (
    <section className="section-padding bg-bg-soft">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <SectionTitle
            eyebrow="新闻中心"
            title="最新动态与洞察"
            subtitle="了解公司动态、产品发布与行业实践"
            align="left"
          />
          <Button to={ROUTES.NEWS} variant="text" className="shrink-0">
            查看全部新闻
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M4 10h12M11 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        </div>

        {loading ? (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="overflow-hidden rounded-md border border-border bg-white shadow-sm"
              >
                <div className="aspect-[16/10] animate-pulse bg-border" />
                <div className="space-y-3 p-6">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-border" />
                  <div className="h-4 w-full animate-pulse rounded bg-border" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-border" />
                </div>
              </div>
            ))}
          </div>
        ) : news.length === 0 ? (
          error ? (
            <SectionError onRetry={onRetry} />
          ) : (
            <SectionEmpty text="暂无新闻" />
          )
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {news.map((item) => (
              <Link
                key={item.id}
                to={ROUTES.NEWS_DETAIL(item.id)}
                className="group flex flex-col overflow-hidden rounded-md border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="aspect-[16/10] overflow-hidden bg-bg-soft">
                  <img
                    src={item.cover}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="rounded-full bg-primary-light px-3 py-1 font-medium text-primary">
                      {item.category}
                    </span>
                    <time>{item.date}</time>
                  </div>
                  <h3 className="mt-4 line-clamp-2 text-base font-semibold text-secondary transition-colors group-hover:text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-text-secondary">
                    {item.summary}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
