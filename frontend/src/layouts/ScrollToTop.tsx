import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 路由切换时回到页面顶部（无 UI）。
 * 放置于 MainLayout 内部，监听 pathname 变化。
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
