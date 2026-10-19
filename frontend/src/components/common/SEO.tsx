import { useEffect } from 'react';
import { useSiteConfig } from '@/providers/SiteConfigProvider';

/** 默认分享封面（`frontend/public/og-cover.png`，1200×630） */
const DEFAULT_OG_IMAGE = '/og-cover.png';

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
    setMeta('property', 'og:url', window.location.href);
    setMeta('property', 'og:image', absoluteUrl(DEFAULT_OG_IMAGE));

    // Twitter / X 卡片
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', finalTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', absoluteUrl(DEFAULT_OG_IMAGE));

    // canonical：同一内容只保留一个规范地址（避免带参链接重复收录）
    setCanonical(window.location.origin + window.location.pathname);
  }, [title, description, keywords, siteConfig]);

  return null;
}

/**
 * 相对路径 → 绝对 URL（OG / Twitter 图片必须是绝对地址）
 * @param path 站内路径（如 `/og-cover.png`）
 * @returns 绝对地址
 */
function absoluteUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : window.location.origin + path;
}

/**
 * 写入 canonical 链接（不存在则创建）
 * @param href 规范地址
 */
function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
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
