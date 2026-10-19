import SEO from '@/components/common/SEO';
import Container from '@/components/common/Container';
import PageHero from '@/components/common/PageHero';
import Card from '@/components/common/Card';
import MessageForm from '@/components/MessageForm';
import { useSiteConfig } from '@/providers/SiteConfigProvider';

/**
 * 联系我们页：
 * - 左侧：联系方式（电话/邮箱/地址/工作时间）+ 地图占位
 * - 右侧：留言表单
 * 联系方式来自 site.config.ts。
 */
export default function Contact() {
  const { siteConfig } = useSiteConfig();
  const { contact, companyName } = siteConfig;

  const contactItems = [
    {
      label: '联系电话',
      value: contact.phone,
      href: `tel:${contact.phone}`,
      icon: (
        <path
          d="M3 5.5A2.5 2.5 0 015.5 3h1.2a1 1 0 01.95.68l.7 2.1a1 1 0 01-.24 1.06l-1 .95a11 11 0 004.9 4.9l.95-1a1 1 0 011.06-.24l2.1.7a1 1 0 01.68.95v1.2A2.5 2.5 0 0114.5 17C8.15 17 3 11.85 3 5.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
        />
      ),
    },
    {
      label: '电子邮箱',
      value: contact.email,
      href: `mailto:${contact.email}`,
      icon: (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        </>
      ),
    },
    {
      label: '公司地址',
      value: contact.address,
      href: undefined,
      icon: (
        <>
          <path
            d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </>
      ),
    },
    {
      label: '工作时间',
      value: contact.workTime,
      href: undefined,
      icon: (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      ),
    },
  ];

  return (
    <>
      <SEO
        title="联系我们"
        description={`联系${companyName}：电话 ${contact.phone}，邮箱 ${contact.email}，地址 ${contact.address}。欢迎在线留言咨询。`}
        keywords={`${siteConfig.seo.keywords},联系我们,联系方式`}
      />

      <PageHero
        title="联系我们"
        subtitle="欢迎通过电话、邮箱或在线留言与我们取得联系"
        breadcrumb={[{ label: '联系我们' }]}
      />

      <section className="section-padding">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* 左侧：联系方式 + 地图 */}
          <div>
            <h2 className="text-h3 font-bold text-secondary">联系方式</h2>
            <p className="mt-3 text-base text-text-secondary">
              随时欢迎您的咨询，我们会第一时间响应。
            </p>

            <div className="mt-8 space-y-4">
              {contactItems.map((item) => {
                const inner = (
                  <Card hoverable className="flex items-center gap-4 !p-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                        {item.icon}
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-text-muted">{item.label}</div>
                      <div className="mt-1 break-words text-base font-medium text-text">
                        {item.value}
                      </div>
                    </div>
                  </Card>
                );

                return item.href ? (
                  <a key={item.label} href={item.href} className="block">
                    {inner}
                  </a>
                ) : (
                  <div key={item.label}>{inner}</div>
                );
              })}
            </div>

            {/* 地图占位 */}
            <div className="mt-8 overflow-hidden rounded-lg border border-border">
              <img
                src={contact.mapImage}
                alt={`${companyName}位置地图（占位）`}
                className="aspect-[16/9] h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>

          {/* 右侧：留言表单 */}
          <div className="lg:pt-1">
            <MessageForm />
          </div>
        </Container>
      </section>
    </>
  );
}
