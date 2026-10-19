import { Link, useParams } from 'react-router-dom';
import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import Button from '@/components/common/Button';
import { SectionError, SkeletonBlock } from '@/components/common/AsyncState';
import { useContent } from '@/hooks/useContent';
import { fetchNewsDetail, ApiError } from '@/services/api';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { ERROR_CODES, ROUTES } from '@/constants';
import type { NewsDetailData } from '@/types';

/**
 * 新闻详情页（/news/:id）：
 * - 标题、发布日期、分类、正文
 * - 上一篇 / 下一篇导航（**直接使用后端返回的 prev / next**，不做本地 findIndex）
 * - 非法 / 不存在 id（接口 4004）→ 现有「新闻未找到」页；其他错误 → 错误 + 重试
 * - SEO title 在数据到达后写入
 */
export default function NewsDetail() {
  const { siteConfig } = useSiteConfig();
  const { id = '' } = useParams<{ id: string }>();

  const { data, loading, error, retry } = useContent<NewsDetailData>(
    `news-detail:${id}`,
    () => fetchNewsDetail(id),
  );

  const isNotFound =
    error instanceof ApiError && error.code === ERROR_CODES.NOT_FOUND;

  // 加载中：占位骨架（PageHero 静态，保证首屏不白屏）
  if (loading) {
    return (
      <>
        <SEO title="新闻中心" description="正在加载新闻详情…" />
        <PageHero
          title="新闻中心"
          breadcrumb={[{ label: '新闻中心', path: ROUTES.NEWS }, { label: '加载中' }]}
        />
        <section className="section-padding">
          <Container>
            <div className="mx-auto max-w-3xl">
              <SkeletonBlock lines={8} />
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
        <SEO title="新闻中心" description="新闻详情加载失败。" />
        <PageHero
          title="新闻中心"
          breadcrumb={[{ label: '新闻中心', path: ROUTES.NEWS }, { label: '加载失败' }]}
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
  if (!data || !data.item) {
    return (
      <>
        <SEO title="新闻未找到" description="您访问的新闻不存在或已被移除。" />
        <PageHero
          title="新闻未找到"
          subtitle="您访问的新闻不存在或已被移除"
          breadcrumb={[{ label: '新闻中心', path: ROUTES.NEWS }, { label: '未找到' }]}
        />
        <section className="section-padding">
          <Container className="flex flex-col items-center text-center">
            <p className="text-base text-text-secondary">
              很抱歉，未找到对应的新闻内容。它可能已被移除或链接有误。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button to={ROUTES.NEWS} variant="primary" size="lg">
                返回新闻中心
              </Button>
              <Button to={ROUTES.HOME} variant="outline" size="lg">
                返回首页
              </Button>
            </div>
          </Container>
        </section>
      </>
    );
  }

  const { item, prev, next } = data;

  return (
    <>
      <SEO
        title={item.title}
        description={item.summary}
        keywords={`${item.title},${item.category},${siteConfig.seo.keywords}`}
      />

      <PageHero
        title={item.title}
        breadcrumb={[{ label: '新闻中心', path: ROUTES.NEWS }, { label: item.category }]}
      />

      <section className="section-padding">
        <Container>
          <div className="mx-auto max-w-3xl">
            {/* 元信息 */}
            <div className="flex items-center justify-center gap-4 text-sm text-text-muted">
              <span className="rounded-full bg-primary-light px-3 py-1 font-medium text-primary">
                {item.category}
              </span>
              <time dateTime={item.date}>发布于 {item.date}</time>
            </div>

            {/* 封面 */}
            <div className="mt-8 overflow-hidden rounded-lg border border-border bg-bg-soft">
              <img
                src={item.cover}
                alt={item.title}
                className="aspect-[16/9] h-full w-full object-cover"
              />
            </div>

            {/* 正文 */}
            <article className="mt-10 whitespace-pre-line text-base leading-[1.9] text-text">
              {item.content}
            </article>

            {/* 上一篇 / 下一篇（后端返回的 prev / next） */}
            <div className="mt-12 grid grid-cols-1 gap-4 border-t border-border pt-8 md:grid-cols-2">
              {prev ? (
                <Link
                  to={ROUTES.NEWS_DETAIL(prev.id)}
                  className="group rounded-md border border-border bg-white p-5 transition-all duration-200 hover:border-primary hover:shadow-sm"
                >
                  <span className="text-xs text-text-muted">上一篇</span>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-secondary group-hover:text-primary">
                    {prev.title}
                  </p>
                </Link>
              ) : (
                <div className="rounded-md border border-dashed border-border p-5 text-sm text-text-muted">
                  已经是第一篇
                </div>
              )}

              {next ? (
                <Link
                  to={ROUTES.NEWS_DETAIL(next.id)}
                  className="group rounded-md border border-border bg-white p-5 text-right transition-all duration-200 hover:border-primary hover:shadow-sm"
                >
                  <span className="text-xs text-text-muted">下一篇</span>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-secondary group-hover:text-primary">
                    {next.title}
                  </p>
                </Link>
              ) : (
                <div className="rounded-md border border-dashed border-border p-5 text-right text-sm text-text-muted">
                  已经是最后一篇
                </div>
              )}
            </div>

            <div className="mt-10 flex justify-center">
              <Button to={ROUTES.NEWS} variant="outline">
                返回新闻中心
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
