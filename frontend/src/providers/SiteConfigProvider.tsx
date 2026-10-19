import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchSiteConfig, clearContentCache } from '@/services/api';
import { siteConfig as staticSiteConfig } from '@/config/site.config';
import type { SiteConfig, SiteConfigData } from '@/types';

/**
 * 站点配置运行时注入（Provider + Hook）
 *
 * 目标：把原先**编译期静态导入**的 `site.config.ts` 升级为**可后台配置**，
 * 同时保证「刷新即生效」且不出现白屏/闪烁。
 *
 * 注入策略（三层，按同步优先级）：
 *   1. **静态配置作为同步初始值**：Provider 初始 state 即 `staticSiteConfig`，
 *      因此首帧就有完整数据，**不会出现空白或闪烁**；
 *   2. **挂载后拉取接口并覆盖**：成功则用后端数据替换（静态值补齐 `nav` / `theme` /
 *      `footer.quickLinks`）；
 *   3. **失败保持静态值**：接口异常时静默降级，前台展示与改造前完全一致。
 *
 * 为什么不引入 loading 门控：站点配置会出现在 Navbar / Footer / SEO 等**全站骨架**上，
 * 若等待接口再渲染会导致整页延迟；同步初始值 + 后台覆盖是代价最小的方案。
 * 另：SEO（`document.title` / meta）在覆盖后会自动重跑——因为 `SEO` 组件
 * 把 `siteConfig` 作为 effect 依赖。
 */

/** 上下文值：完整站点配置 + 手动重载 */
export interface SiteConfigContextValue {
  /** 合并后的完整站点配置（静态值兜底，接口成功后覆盖） */
  siteConfig: SiteConfig;
  /** 手动重新拉取（清缓存后强制请求） */
  reload: () => void;
}

/** 默认值 = 静态配置，使脱离 Provider 的调用也能安全工作 */
const SiteConfigContext = createContext<SiteConfigContextValue>({
  siteConfig: staticSiteConfig,
  reload: () => undefined,
});

/**
 * 用后端数据覆盖静态配置（静态值补齐不在契约内的 `nav` / `theme` / `footer.quickLinks`）
 *
 * 逐字段回退：后端返回空字符串时沿用静态值，避免「后台未填」导致前台显示空白，
 * 也让首次上线（`site_config` 尚未配置）时网站保持可用。
 *
 * @param base 静态配置（提供 nav / theme / quickLinks 与空值兜底）
 * @param data 后端返回的业务字段
 * @returns 完整 SiteConfig
 */
export function mergeSiteConfig(base: SiteConfig, data: SiteConfigData): SiteConfig {
  /** 空串视为「未配置」，回退到静态值 */
  const pick = (fromApi: string | undefined, fallback: string): string => {
    const value = (fromApi ?? '').trim();
    return value === '' ? fallback : value;
  };

  return {
    ...base,
    companyName: pick(data.companyName, base.companyName),
    logo: pick(data.logo, base.logo),
    slogan: pick(data.slogan, base.slogan),
    description: pick(data.description, base.description),
    // nav / theme 不在接口契约内，始终沿用静态配置
    nav: base.nav,
    theme: base.theme,
    contact: {
      phone: pick(data.contact?.phone, base.contact.phone),
      email: pick(data.contact?.email, base.contact.email),
      address: pick(data.contact?.address, base.contact.address),
      workTime: pick(data.contact?.workTime, base.contact.workTime),
      mapImage: pick(data.contact?.mapImage, base.contact.mapImage),
    },
    footer: {
      copyright: pick(data.footer?.copyright, base.footer.copyright),
      icp: pick(data.footer?.icp, base.footer.icp),
      // 快速链接与导航同源，保持静态
      quickLinks: base.footer.quickLinks,
      // 社交链接：后端返回非空数组才覆盖（空数组视为「未配置」）
      socials:
        Array.isArray(data.footer?.socials) && data.footer.socials.length > 0
          ? data.footer.socials
          : base.footer.socials,
    },
    seo: {
      title: pick(data.seo?.title, base.seo.title),
      description: pick(data.seo?.description, base.seo.description),
      keywords: pick(data.seo?.keywords, base.seo.keywords),
    },
  };
}

/**
 * 站点配置 Provider：包裹需要读取站点配置的整个前台树
 * @param props.children 子节点
 */
export function SiteConfigProvider({ children }: { children: ReactNode }) {
  // 初始值即静态配置 → 首帧完整，无闪烁
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(staticSiteConfig);

  /**
   * 拉取接口并合并。
   * 组件卸载后不再 setState（避免 React 警告）；React 18 StrictMode 的
   * 双次 effect 由 `fetchSiteConfig` 内部的在途请求去重消化，不会重复发请求。
   */
  const load = useCallback((cancelled: () => boolean): void => {
    void fetchSiteConfig()
      .then((data) => {
        if (cancelled()) {
          return;
        }
        setSiteConfig(mergeSiteConfig(staticSiteConfig, data));
      })
      .catch(() => {
        // 静默降级：接口不可用时保持静态配置（前台与改造前一致）
      });
  }, []);

  useEffect(() => {
    let done = false;
    load(() => done);

    return () => {
      done = true;
    };
  }, [load]);

  /** 手动重载：清缓存后强制重新请求 */
  const reload = useCallback((): void => {
    clearContentCache();
    load(() => false);
  }, [load]);

  const value = useMemo<SiteConfigContextValue>(
    () => ({ siteConfig, reload }),
    [siteConfig, reload],
  );

  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

/**
 * 读取站点配置（前台组件统一入口）
 *
 * 用法：
 *   const siteConfig = useSiteConfig();          // 只要数据
 *   const { siteConfig, reload } = useSiteConfig(); // 需要手动重载
 *
 * @returns 上下文值（脱离 Provider 时返回静态配置）
 */
export function useSiteConfig(): SiteConfigContextValue {
  return useContext(SiteConfigContext);
}

export default SiteConfigProvider;
