import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ScrollToTop from '@/layouts/ScrollToTop';
import { SiteConfigProvider } from '@/providers/SiteConfigProvider';

/**
 * 主布局：Navbar + 页面内容(<Outlet/>) + Footer。
 * 路由切换时由 ScrollToTop 回到顶部。
 *
 * `SiteConfigProvider` 包在最外层：站点配置出现在 Navbar / Footer / SEO 等全站骨架上，
 * 统一由此注入，前台任意子页面用 `useSiteConfig()` 读取即可。
 */
export default function MainLayout() {
  const { pathname } = useLocation();

  // 兜底：即使 ScrollToTop 生效，此处也确保切换路由回到顶部（避免浏览器滚动恢复干扰）
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <SiteConfigProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <ScrollToTop />
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </SiteConfigProvider>
  );
}
