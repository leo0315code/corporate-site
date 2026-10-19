import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSiteConfig } from '@/providers/SiteConfigProvider';
import Container from '@/components/common/Container';
import { ROUTES } from '@/constants';

/**
 * 顶部导航栏：
 * - Logo + 菜单（桌面端水平，当前项主色下划线）
 * - 滚动吸顶：滚动超过阈值后加背景模糊与阴影
 * - 移动端汉堡菜单可开合，点击链接后自动收起
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  // 站点配置（公司名 / Logo 可后台修改；导航菜单 nav 保持静态配置）
  const { siteConfig } = useSiteConfig();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 路由变化时收起移动端菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // 菜单展开时锁定页面滚动
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled
          ? 'border-border bg-white/90 shadow-sm backdrop-blur'
          : 'border-transparent bg-white'
      }`}
    >
      <Container className="flex h-16 items-center justify-between md:h-20">
        {/* Logo */}
        <Link to={ROUTES.HOME} className="flex items-center gap-3" aria-label={siteConfig.companyName}>
          <img src={siteConfig.logo} alt={siteConfig.companyName} className="h-9 w-auto md:h-10" />
        </Link>

        {/* 桌面端菜单 */}
        <nav className="hidden md:flex md:items-center md:gap-8">
          {siteConfig.nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === ROUTES.HOME}
              className={({ isActive }) =>
                `relative py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive ? 'text-primary' : 'text-text-secondary hover:text-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-primary transition-transform duration-200 ${
                      isActive ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 桌面端右侧联系按钮 */}
        <div className="hidden md:block">
          <Link
            to={ROUTES.CONTACT}
            className="inline-flex items-center rounded-btn bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-primary-dark hover:-translate-y-0.5"
          >
            联系我们
          </Link>
        </div>

        {/* 移动端汉堡按钮 */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-btn text-secondary md:hidden"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span className="relative block h-5 w-6">
            <span
              className={`absolute left-0 block h-0.5 w-6 rounded bg-current transition-all duration-300 ${
                menuOpen ? 'top-2 rotate-45' : 'top-0.5'
              }`}
            />
            <span
              className={`absolute left-0 top-2 block h-0.5 w-6 rounded bg-current transition-all duration-300 ${
                menuOpen ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-6 rounded bg-current transition-all duration-300 ${
                menuOpen ? 'top-2 -rotate-45' : 'top-3.5'
              }`}
            />
          </span>
        </button>
      </Container>

      {/* 移动端下拉菜单 */}
      <div
        className={`overflow-hidden border-t border-border bg-white transition-[max-height] duration-300 md:hidden ${
          menuOpen ? 'max-h-96' : 'max-h-0'
        }`}
      >
        <Container className="flex flex-col py-4">
          {siteConfig.nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === ROUTES.HOME}
              className={({ isActive }) =>
                `rounded-btn px-4 py-3 text-base font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-text-secondary hover:bg-bg-soft hover:text-primary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to={ROUTES.CONTACT}
            className="mt-3 rounded-btn bg-primary px-4 py-3 text-center text-base font-medium text-white"
          >
            联系我们
          </Link>
        </Container>
      </div>
    </header>
  );
}
