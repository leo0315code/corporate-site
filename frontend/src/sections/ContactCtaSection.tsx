import { useSiteConfig } from '@/providers/SiteConfigProvider';
import Container from '@/components/common/Container';
import Button from '@/components/common/Button';
import { ROUTES } from '@/constants';

/**
 * 首页底部联系入口：主色背景 CTA 区块，
 * 联系方式来自站点配置（后台可改）。
 */
export default function ContactCtaSection() {
  const { siteConfig } = useSiteConfig();
  const { contact } = siteConfig;

  return (
    <section className="section-padding">
      <Container>
        <div className="relative overflow-hidden rounded-lg bg-primary px-6 py-14 text-center md:px-16 md:py-20">
          {/* 背景装饰 */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-accent/20 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative">
            <h2 className="text-h3 font-bold text-white md:text-h2">
              有想法？让我们一起聊聊
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80">
              无论是产品咨询、方案定制还是合作洽谈，我们都乐于倾听你的需求，并给出专业的建议。
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                to={ROUTES.CONTACT}
                variant="primary"
                size="lg"
                className="!bg-white !text-primary hover:!bg-white/90"
              >
                在线留言
              </Button>
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-2 rounded-btn border border-white/40 px-8 py-4 text-base font-medium text-white transition-all duration-200 hover:bg-white/10"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M3 5.5A2.5 2.5 0 015.5 3h1.2a1 1 0 01.95.68l.7 2.1a1 1 0 01-.24 1.06l-1 .95a11 11 0 004.9 4.9l.95-1a1 1 0 011.06-.24l2.1.7a1 1 0 01.68.95v1.2A2.5 2.5 0 0114.5 17C8.15 17 3 11.85 3 5.5z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                {contact.phone}
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
