import { useEffect } from 'react';
import { useSiteConfig } from '@/providers/SiteConfigProvider';

export interface SEOProps {
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description?: string;
  /** 关键词（可选，覆盖站点级 keywords） */
  keywords?: string;
}

/**
 * SEO 组件：运行时写入 document.title 与 meta 标签。
 * 采用「无 DOM 输出」的副作用组件，随路由切换更新。
 *
 * `siteConfig` 作为 effect 依赖：站点配置从接口覆盖后会**自动重跑**，
 * 保证后台改完 SEO 标题/描述后前台标题随之更新。
 *
 * @param props 页面级 SEO 信息
 */
export default function SEO({ title, description, keywords }: SEOProps) {
  const { siteConfig } = useSiteConfig();

  useEffect(() => {
    // 标题：页面标题 | 公司名（首页标题即站点标题，不重复拼接）
    const siteTitle = siteConfig.seo.title;
    const finalTitle = title === siteTitle ? title : `${title} | ${siteConfig.companyName}`;
    document.title = finalTitle;

    const desc = description ?? siteConfig.seo.description;
    const kws = keywords ?? siteConfig.seo.keywords;

    setMeta('name', 'description', desc);
    setMeta('name', 'keywords', kws);

    // Open Graph
    setMeta('property', 'og:title', finalTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:site_name', siteConfig.companyName);
  }, [title, description, keywords, siteConfig]);

  return null;
}

/**
 * 设置或创建 meta 标签
 * @param attr 'name' | 'property'
 * @param key 属性值
 * @param content 内容
 */
function setMeta(attr: 'name' | 'property', key: string, content: string) {
  if (!content) {
    return;
  }
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
