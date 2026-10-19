import { useEffect } from 'react';

/** robots meta 的稳定选择器 */
const SELECTOR = 'meta[name="robots"]';

/**
 * 后台页面禁止收录
 *
 * 后台不进 sitemap，也不在 robots.txt 里写路径（写了等于把隐藏入口广播出去），
 * 因此在后台页面上动态打 `noindex,nofollow`；离开时恢复原值。
 *
 * @param active 是否启用（默认 true；可用于按条件关闭）
 */
export function useNoindex(active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    let el = document.head.querySelector<HTMLMetaElement>(SELECTOR);
    const previous = el?.getAttribute('content') ?? null;

    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex,nofollow');

    return () => {
      if (previous === null) {
        el?.remove();
      } else {
        el?.setAttribute('content', previous);
      }
    };
  }, [active]);
}
