import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { DegradedNotice } from '@/components/common/AsyncState';
import { useContent } from '@/hooks/useContent';
import { fetchHomeSummary } from '@/services/api';
import { APP } from '@/constants';
import type { HomeSummary } from '@/types';
import products from '@/data/products';
import advantages from '@/data/advantages';
import cases from '@/data/cases';
import news from '@/data/news';
import HeroSection from '@/sections/HeroSection';
import BusinessSection from '@/sections/BusinessSection';
import StatsSection from '@/sections/StatsSection';
import CasesSection from '@/sections/CasesSection';
import NewsSection from '@/sections/NewsSection';
import ContactCtaSection from '@/sections/ContactCtaSection';

/**
 * 首页降级数据（fallback）：
 * 由 `src/data/*.ts` 组装，与后端 `/api/home/summary` 返回结构**一致**
 * （products / news 截断；advantages / cases 全量）。
 * 接口失败时由 `useContent` 以此兜底，保证不白屏。
 */
const FALLBACK_HOME: HomeSummary = {
  products: products.slice(0, APP.HOME_PRODUCT_LIMIT),
  // 前端 Advantage 无 id，聚合结构需附带 id（渲染忽略），此处按下标补齐
  advantages: advantages.map((item, index) => ({ ...item, id: index + 1 })),
  cases,
  news: news.slice(0, APP.HOME_NEWS_LIMIT),
};

/**
 * 首页：组合 6 大区块。
 * 顺序：Hero → 核心业务 → 数据与优势 → 客户案例 → 新闻摘要 → 底部联系入口。
 *
 * 数据来源：顶层**一次**调用 `useContent('home')` 命中聚合接口 `/api/home/summary`，
 * 再把各区块数据以 props 下发，避免 4 次独立请求。
 * 首屏：Hero 左侧文案静态优先；内容区块随 `loading` 展示骨架，`error` 时降级到 fallback。
 */
export default function Home() {
  const { siteConfig } = useSiteConfig();
  const { data, loading, error, retry } = useContent<HomeSummary>(
    'home',
    () => fetchHomeSummary(APP.HOME_PRODUCT_LIMIT, APP.HOME_NEWS_LIMIT),
    FALLBACK_HOME,
  );

  const summary = data ?? FALLBACK_HOME;

  return (
    <>
      <SEO
        title={siteConfig.seo.title}
        description={siteConfig.seo.description}
        keywords={siteConfig.seo.keywords}
      />

      {/* 降级轻提示：接口失败但已用本地数据兜底时展示（不打断阅读） */}
      {error ? (
        <Container className="pt-6">
          <DegradedNotice onRetry={retry} />
        </Container>
      ) : null}

      <HeroSection advantages={summary.advantages} loading={loading} />
      <BusinessSection
        products={summary.products}
        loading={loading}
        error={error}
        onRetry={retry}
      />
      <StatsSection
        advantages={summary.advantages}
        loading={loading}
        error={error}
        onRetry={retry}
      />
      <CasesSection cases={summary.cases} loading={loading} error={error} onRetry={retry} />
      <NewsSection news={summary.news} loading={loading} error={error} onRetry={retry} />
      <ContactCtaSection />
    </>
  );
}
