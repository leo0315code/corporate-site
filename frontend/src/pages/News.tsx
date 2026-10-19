import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import Button from '@/components/common/Button';
import { SectionEmpty, SectionError, DegradedNotice } from '@/components/common/AsyncState';
import { useContent } from '@/hooks/useContent';
import { fetchNewsList } from '@/services/api';
import news from '@/data/news';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { APP, ROUTES } from '@/constants';
import type { NewsItem, PagedData } from '@/types';

/** 降级数据（接口失败时兜底，结构对齐 fetchNewsList 返回） */
const FALLBACK_NEWS: PagedData<NewsItem> = {
  total: news.length,
  page: 1,
  size: news.length,
  items: news,
};

/**
 * 新闻中心列表页：
 * - 分类筛选（客户端）
 * - 卡片列表（封面 + 标题 + 日期 + 摘要）
 * - 「加载更多」分页（客户端 slice，保留原有交互）
 * - 三态：加载骨架 / 错误 + 重试 / 空态
 */
export default function News() {
  const { siteConfig } = useSiteConfig();
  const [activeCategory, setActiveCategory] = useState('全部');
  // 显式标注为 number：APP 使用 as const，NEWS_PAGE_SIZE 会被推断为字面量 4，
  // 若不标注，setter 将无法接受 number 类型（TS2345）。
  const [visibleCount, setVisibleCount] = useState<number>(APP.NEWS_PAGE_SIZE);

  // 列表数据走 API（size=50 覆盖全量）；失败降级到本地数据
  const { data, loading, error, retry } = useContent<PagedData<NewsItem>>(
    'news-list',
    () => fetchNewsList({ size: 50 }),
    FALLBACK_NEWS,
  );

  const items = useMemo(() => data?.items ?? [], [data]);

  const categories = useMemo(() => {
    const set = new Set(items.map((item) => item.category));
    return ['全部', ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    if (activeCategory === '全部') {
      return items;
    }
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    setVisibleCount(APP.NEWS_PAGE_SIZE);
  };

  return (
    <>
      <SEO
        title="新闻中心"
        description={`${siteConfig.companyName}的最新动态、产品发布与行业洞察。`}
        keywords={`${siteConfig.seo.keywords},新闻中心,公司动态`}
      />

      <PageHero
        title="新闻中心"
        subtitle="了解公司动态、产品发布与行业实践"
        breadcrumb={[{ label: '新闻中心' }]}
      />

      <section className="section-padding">
        <Container>
          {/* 降级轻提示：接口失败但已用本地数据兜底 */}
          {error && items.length > 0 ? (
            <div className="mb-8">
              <DegradedNotice onRetry={retry} />
            </div>
          ) : null}

          {/* 分类筛选（数据到达后展示） */}
          {!loading && filtered.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {categories.map((category) => {
                const isActive = category === activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleCategoryChange(category)}
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

          {/* 新闻列表（三态） */}
          {loading ? (
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((slot) => (
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
          ) : items.length === 0 ? (
            error ? (
              <SectionError onRetry={retry} />
            ) : (
              <SectionEmpty text="暂无新闻。" />
            )
          ) : (
            <>
              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {visible.map((item) => (
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
                        <time dateTime={item.date}>{item.date}</time>
                      </div>
                      <h3 className="mt-4 line-clamp-2 text-base font-semibold text-secondary transition-colors group-hover:text-primary">
                        {item.title}
                      </h3>
                      <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-text-secondary">
                        {item.summary}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {/* 加载更多 */}
              {hasMore ? (
                <div className="mt-12 flex justify-center">
                  <Button
                    variant="outline"
                    size="lg"
                    buttonProps={{
                      onClick: () => setVisibleCount((prev) => prev + APP.NEWS_PAGE_SIZE),
                    }}
                  >
                    加载更多
                  </Button>
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <div className="mt-16 text-center text-text-secondary">
                  该分类下暂无新闻。
                </div>
              ) : null}
            </>
          )}
        </Container>
      </section>
    </>
  );
}
