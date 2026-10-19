import { Link } from 'react-router-dom';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import Container from '@/components/common/Container';

/**
 * 统一页脚：公司信息 + 快速链接 + 联系方式 + 备案/社交。
 * 数据来自站点配置（后台可改，静态配置兜底）。
 */
export default function Footer() {
  const { siteConfig } = useSiteConfig();
  const { companyName, slogan, description, contact, footer } = siteConfig;
  const year = new Date().getFullYear();

  return (
    <footer className="bg-secondary text-white/80">
      <Container className="py-14 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* 公司信息 */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary text-lg font-bold text-white">
                {companyName.slice(0, 1)}
              </span>
              <span className="text-lg font-semibold text-white">{companyName}</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              {description}
            </p>
            <p className="mt-4 text-sm font-medium text-accent">{slogan}</p>
          </div>

          {/* 快速链接 */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
              快速链接
            </h3>
            <ul className="mt-4 space-y-3">
              {footer.quickLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 联系方式 */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
              联系我们
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  电话
                </span>
                <span className="text-white/80">{contact.phone}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  邮箱
                </span>
                <span className="text-white/80">{contact.email}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  地址
                </span>
                <span className="text-white/80">{contact.address}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  时间
                </span>
                <span className="text-white/80">{contact.workTime}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 底栏 */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
          <p className="text-xs text-white/50">
            {footer.copyright || `© ${year} ${companyName}`}
            {footer.icp ? `　${footer.icp}` : ''}
          </p>
          <div className="flex items-center gap-5">
            {footer.socials.map((social) => (
              <a
                key={social.label}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/50 transition-colors hover:text-white"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
