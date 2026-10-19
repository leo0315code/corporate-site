import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import SectionTitle from '@/components/common/SectionTitle';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { SectionError, SkeletonBlock } from '@/components/common/AsyncState';
import { useContent } from '@/hooks/useContent';
import { fetchAbout } from '@/services/api';
import aboutData from '@/data/about';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import { ROUTES } from '@/constants';
import type { AboutData } from '@/types';

/**
 * 关于我们页：公司简介 + 愿景使命 + 发展历程 + 能力资质 + 企业文化。
 * 数据来自 `/api/about/detail`（单例），失败降级到 `data/about.ts`。
 * 三态：加载骨架 / 错误 + 重试 / 正常渲染（静态字段无「空表」语义）。
 */
export default function About() {
  const { siteConfig } = useSiteConfig();
  const { data, loading, error, retry } = useContent<AboutData>(
    'about',
    () => fetchAbout(),
    aboutData,
  );

  const about = data ?? aboutData;
  const { vision, mission } = about;

  return (
    <>
      <SEO
        title="关于我们"
        description={siteConfig.description}
        keywords={`${siteConfig.seo.keywords},关于我们,公司简介`}
      />

      <PageHero
        title="关于我们"
        subtitle={siteConfig.slogan}
        breadcrumb={[{ label: '关于我们' }]}
      />

      {loading ? (
        // 加载中：骨架屏（首屏 Hero 静态已就绪，不白屏）
        <section className="section-padding">
          <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <SectionTitle eyebrow="公司简介" title="我们是谁" align="left" />
              <div className="mt-6">
                <SkeletonBlock lines={6} />
              </div>
              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {[0, 1].map((slot) => (
                  <div key={slot} className="rounded-md bg-bg-soft p-5">
                    <SkeletonBlock lines={3} />
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="aspect-square animate-pulse rounded-lg bg-bg-soft" />
            </div>
          </Container>
        </section>
      ) : error && !data ? (
        // 加载失败且无降级数据（理论不发生，兜底）：错误 + 重试
        <section className="section-padding">
          <Container>
            <SectionError onRetry={retry} />
          </Container>
        </section>
      ) : (
        <>
          {/* 公司简介 */}
          <section className="section-padding">
            <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <SectionTitle eyebrow="公司简介" title="我们是谁" align="left" />
                <p className="mt-6 text-base leading-relaxed text-text-secondary">
                  {about.intro}
                </p>

                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="rounded-md border-l-4 border-primary bg-bg-soft p-5">
                    <div className="text-sm font-semibold text-primary">愿景</div>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {vision}
                    </p>
                  </div>
                  <div className="rounded-md border-l-4 border-accent bg-bg-soft p-5">
                    <div className="text-sm font-semibold text-accent">使命</div>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {mission}
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-lg border border-border bg-primary-light p-8">
                  <img
                    src="/about-illustration.svg"
                    alt="公司形象图（占位）"
                    className="mx-auto w-full max-w-sm"
                    loading="lazy"
                  />
                </div>
              </div>
            </Container>
          </section>

          {/* 发展历程 */}
          {about.timeline.length > 0 ? (
            <section className="section-padding bg-bg-soft">
              <Container>
                <SectionTitle
                  eyebrow="发展历程"
                  title="一路走来的里程碑"
                  subtitle="每一个阶段，都是我们对专业与价值的坚持"
                />

                <ol className="relative mt-12 space-y-8 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-border md:before:left-1/2 md:before:-translate-x-1/2">
                  {about.timeline.map((item, index) => {
                    const isLeft = index % 2 === 0;
                    return (
                      <li
                        key={`${item.year}-${item.title}`}
                        className={`relative flex flex-col md:flex-row md:items-center ${
                          isLeft ? 'md:justify-start' : 'md:justify-end'
                        }`}
                      >
                        {/* 时间点 */}
                        <span className="absolute left-0 top-2 z-10 h-4 w-4 rounded-full border-2 border-primary bg-white md:left-1/2 md:-translate-x-1/2" />
                        <div
                          className={`ml-8 w-[calc(100%-2rem)] md:ml-0 md:w-[calc(50%-2rem)] ${
                            isLeft ? 'md:pr-8 md:text-right' : 'md:pl-8'
                          }`}
                        >
                          <Card className="!p-5">
                            <div className="text-lg font-bold text-primary">{item.year}</div>
                            <div className="mt-1 text-base font-semibold text-secondary">
                              {item.title}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                              {item.desc}
                            </p>
                          </Card>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Container>
            </section>
          ) : null}

          {/* 能力与资质 */}
          {about.abilities.length > 0 ? (
            <section className="section-padding">
              <Container>
                <SectionTitle
                  eyebrow="团队与资质"
                  title="支撑业务的核心能力"
                  subtitle="技术、行业、交付与服务构成的综合能力，是我们交付成果的保障"
                />
                <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {about.abilities.map((ability) => (
                    <Card key={ability.title} hoverable>
                      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-light text-primary">
                        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                          <path
                            d="M5 12l4 4 10-11"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <h3 className="mt-5 text-base font-semibold text-secondary">
                        {ability.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                        {ability.desc}
                      </p>
                    </Card>
                  ))}
                </div>
              </Container>
            </section>
          ) : null}

          {/* 企业文化 */}
          <section className="section-padding bg-secondary">
            <Container>
              <SectionTitle
                eyebrow="企业文化"
                title="我们的价值观"
                subtitle="这些信念指引我们如何做事、如何合作"
                light
              />
              {about.values.length > 0 ? (
                <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                  {about.values.map((value) => (
                    <span
                      key={value}
                      className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-base font-medium text-white transition-colors hover:border-accent hover:text-accent"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-12 flex justify-center">
                <Button to={ROUTES.CONTACT} variant="primary" size="lg">
                  与我们建立联系
                </Button>
              </div>
            </Container>
          </section>
        </>
      )}
    </>
  );
}
