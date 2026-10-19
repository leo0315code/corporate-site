import { Link } from 'react-router-dom';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import Container from '@/components/common/Container';
import Button from '@/components/common/Button';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { ROUTES } from '@/constants';
import type { AdvantageItem } from '@/types';

export interface HeroSectionProps {
  /** 核心优势数据（来自首页聚合接口；仅取前 2 条渲染） */
  advantages?: AdvantageItem[];
  /** 是否加载中（仅影响右侧数字卡片；左侧价值主张始终静态渲染，保证首屏不白屏） */
  loading?: boolean;
}

/**
 * 首页 Hero 首屏：
 * - 左侧：价值主张（公司名 + 标语）+ 副标题 + 主/次 CTA（**静态同步渲染**，来自站点配置，
 *   保证首屏不白屏；后台修改后由 Provider 覆盖）
 * - 右侧：装饰性视觉卡片（展示核心优势数字，数据来自首页聚合）
 * - 首屏策略：左侧静态优先渲染；右侧数字卡片加载时展示骨架
 */
export default function HeroSection({ advantages = [], loading = false }: HeroSectionProps) {
  const { siteConfig } = useSiteConfig();
  const { companyName, slogan, description } = siteConfig;
  const highlights = advantages.slice(0, 2);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-light/60 via-white to-white">
      {/* 背景装饰 */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-20 top-40 h-64 w-64 rounded-full bg-accent/5 blur-3xl"
        aria-hidden="true"
      />

      <Container className="relative grid grid-cols-1 items-center gap-12 py-16 md:py-24 lg:grid-cols-2 lg:py-28">
        {/* 左侧文案（静态优先） */}
        <div className="animate-fade-in-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            {companyName}
          </span>

          <h1 className="mt-6 text-[28px] font-bold leading-[1.25] text-secondary sm:text-4xl md:text-h1">
            {slogan}
          </h1>

          <p className="mt-6 max-w-xl text-base text-text-secondary md:text-lg">
            {description}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button to={ROUTES.PRODUCTS} variant="primary" size="lg">
              了解产品服务
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
            <Button to={ROUTES.CONTACT} variant="outline" size="lg">
              联系我们
            </Button>
          </div>
        </div>

        {/* 右侧视觉卡片 */}
        <div className="animate-fade-in-up lg:pl-8">
          <div className="relative">
            <div className="rounded-lg border border-border bg-white p-6 shadow-md md:p-8">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  我们的核心优势
                </span>
                <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary">
                  值得信赖
                </span>
              </div>

              {loading ? (
                <div className="mt-6 grid grid-cols-2 gap-6">
                  {[0, 1].map((slot) => (
                    <div key={slot}>
                      <SkeletonBlock lines={3} />
                    </div>
                  ))}
                </div>
              ) : highlights.length > 0 ? (
                <div className="mt-6 grid grid-cols-2 gap-6">
                  {highlights.map((item) => (
                    <div key={item.label}>
                      <div className="text-h3 font-bold text-primary">{item.value}</div>
                      <div className="mt-1 text-sm font-medium text-text">{item.label}</div>
                      <div className="mt-1 text-xs text-text-muted">{item.desc}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-sm text-text-muted">暂无数据</p>
              )}

              <div className="mt-8 rounded-md bg-bg-soft p-5">
                <p className="text-sm leading-relaxed text-text-secondary">
                  从咨询规划到落地实施，我们提供端到端的数字化服务，帮助企业稳步完成转型。
                </p>
                <Link
                  to={ROUTES.ABOUT}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark"
                >
                  了解更多关于我们
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M4 10h12M11 5l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </div>
            </div>

            {/* 悬浮点缀 */}
            <div className="absolute -bottom-5 -left-5 hidden rounded-md border border-border bg-white px-5 py-4 shadow-md md:block">
              <div className="text-lg font-bold text-accent">8+ 年</div>
              <div className="text-xs text-text-muted">行业深耕经验</div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
