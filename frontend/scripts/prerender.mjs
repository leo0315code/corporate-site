#!/usr/bin/env node
/**
 * 构建期静态化（SEO 预渲染 · 元信息层）
 *
 * 背景：前台是纯 SPA，`document.title` / `meta` 由 React 在运行时写入，
 * 爬虫与社交分享抓取时往往拿不到内容级标题。本脚本在 `vite build` 之后，
 * 按路由**生成独立的 HTML 副本**（每页一份 `<title>` / `description` / `canonical` /
 * `og:*` / JSON-LD），并附 `<noscript>` 内部链接块，弥补纯客户端渲染的收录短板。
 *
 * 设计边界（重要）：
 * - 只重写 **head 元信息 + noscript**，不注入 React 树（不做 DOM 预渲染），
 *   因此不会与 `createRoot` 冲突、不需要 hydration；
 * - 数据来源：后端 `/api/site/config` 与 `/api/product|news/list`；接口不可用时
 *   **自动降级**为只生成静态页（用构建产物里现有的 title/description 兜底），
 *   保证离线构建也能跑通；
 * - 幂等：重复执行只会覆盖自己生成的目录，`assets/` 不受影响。
 *
 * 用法：
 *   node scripts/prerender.mjs --base https://www.example.com --api http://127.0.0.1:8000/api
 *   npm run build && npm run prerender -- --base https://your-domain.com
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/* ---------- 参数 ---------- */

const args = process.argv.slice(2);
/** 支持 `--name=value` 与 `--name value` 两种写法 */
const argOf = (name, fallback) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    return eq.slice(name.length + 3);
  }
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return fallback;
};

const DIST = path.resolve(argOf('dist', 'dist'));
const BASE = argOf('base', process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const API = argOf('api', process.env.API_BASE || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
const TIMEOUT = 5000;

/* ---------- 静态页定义（与 frontend/src/router.tsx 保持一致） ---------- */

const STATIC_ROUTES = [
  { path: '/', titleSuffix: null, priority: '1.0' },
  { path: '/products', title: '产品服务', priority: '0.9' },
  { path: '/news', title: '新闻中心', priority: '0.9' },
  { path: '/about', title: '关于我们', priority: '0.7' },
  { path: '/contact', title: '联系我们', priority: '0.7' },
];

/* ---------- 工具 ---------- */

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    return body && body.code === 0 ? body.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 替换或插入 head 中的 meta（按 name/property 定位） */
function upsertMeta(html, attr, key, content) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

/** 生成一份页面 HTML */
function renderPage(template, { url, title, description, keywords, ogType, noscriptLinks }) {
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = upsertMeta(html, 'name', 'description', description);
  if (keywords) {
    html = upsertMeta(html, 'name', 'keywords', keywords);
  }
  html = upsertMeta(html, 'property', 'og:title', title);
  html = upsertMeta(html, 'property', 'og:description', description);
  html = upsertMeta(html, 'property', 'og:url', url);
  html = upsertMeta(html, 'property', 'og:type', ogType);

  // canonical
  const canonical = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  html = /<link\s+rel="canonical"[^>]*>/i.test(html)
    ? html.replace(/<link\s+rel="canonical"[^>]*>/i, canonical)
    : html.replace('</head>', `    ${canonical}\n  </head>`);

  // Organization JSON-LD 里的 url 指向本站
  html = html.replace(/"url":\s*"https?:\/\/[^"]*"/, `"url": "${url.replace(/\/[^/]*$/, '')}"`);

  // noscript：给不执行 JS 的抓取器一组内部链接（仅首页/列表页有价值）
  if (noscriptLinks && noscriptLinks.length > 0) {
    const items = noscriptLinks
      .map((l) => `        <li><a href="${escapeHtml(l.href)}">${escapeHtml(l.text)}</a></li>`)
      .join('\n');
    const block = `    <noscript>\n      <nav>\n${items}\n      </nav>\n    </noscript>`;
    html = html.replace(/^[ \t]*<div id="root"><\/div>/m, `${block}\n    <div id="root"></div>`);
  }

  return html;
}

/* ---------- 主流程 ---------- */

async function main() {
  const templatePath = path.join(DIST, 'index.html');
  if (!existsSync(templatePath)) {
    console.error(`✗ 未找到 ${templatePath}，请先执行 vite build`);
    process.exit(1);
  }

  // 可重复执行：先剥掉上一次生成的 noscript 块，避免多次运行叠加
  const template = (await readFile(templatePath, 'utf8')).replace(
    /[ \t]*<noscript>[\s\S]*?<\/noscript>\r?\n?/g,
    '',
  );

  // 站点配置（失败则降级为模板里已有的 title/description）
  const site = await fetchJson(`${API}/site/config`);
  const fallbackTitle = (template.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '企业官网').trim();
  const fallbackDesc =
    template.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ||
    '通用企业官网，提供产品服务、新闻中心与在线留言。';

  const companyName = site?.companyName?.trim() || fallbackTitle.split('|')[0].trim();
  const siteDesc = site?.description?.trim() || fallbackDesc;
  const siteKeywords = site?.seo?.keywords?.trim() || '';

  // 列表接口字段为 `items`（兼容旧命名 `list`）
  const products = (await fetchJson(`${API}/product/list?page=1&size=50`))?.items ?? [];
  const news = (await fetchJson(`${API}/news/list?page=1&size=50`))?.items ?? [];

  const apiOk = Boolean(site) || products.length > 0 || news.length > 0;
  if (!apiOk) {
    console.warn('⚠ 后端接口不可用，仅生成静态页（元信息取构建产物默认值）');
  }

  const navLinks = [
    { href: `${BASE}/`, text: '首页' },
    { href: `${BASE}/products`, text: '产品服务' },
    { href: `${BASE}/news`, text: '新闻中心' },
    { href: `${BASE}/about`, text: '关于我们' },
    { href: `${BASE}/contact`, text: '联系我们' },
  ];

  let written = 0;

  /** 写出一页（route 形如 '/products/abc'） */
  async function emit(route, meta) {
    const dir = route === '/' ? DIST : path.join(DIST, route.replace(/^\//, ''));
    await mkdir(dir, { recursive: true });
    const html = renderPage(template, { ...meta, url: `${BASE}${route === '/' ? '/' : route}` });
    await writeFile(path.join(dir, 'index.html'), html, 'utf8');
    written += 1;
  }

  // 1) 静态页
  for (const route of STATIC_ROUTES) {
    const title = route.title ? `${route.title} | ${companyName}` : `${companyName} | 企业官网`;
    await emit(route.path, {
      title,
      description: route.path === '/' ? siteDesc : `${companyName}的${route.title} —— ${siteDesc}`,
      keywords: siteKeywords,
      ogType: 'website',
      noscriptLinks: route.path === '/' ? navLinks : navLinks,
    });
  }

  // 2) 详情页（内容来自库；接口不可用时自动跳过）
  for (const item of products) {
    const summary = (item.summary || item.name || '').trim();
    await emit(`/products/${item.id}`, {
      title: `${item.name} | ${companyName}`,
      description: summary || siteDesc,
      keywords: [item.name, item.category, siteKeywords].filter(Boolean).join(','),
      ogType: 'article',
      noscriptLinks: null,
    });
  }

  for (const item of news) {
    const summary = (item.summary || item.title || '').trim();
    await emit(`/news/${item.id}`, {
      title: `${item.title} | ${companyName}`,
      description: summary || siteDesc,
      keywords: [item.title, item.category, siteKeywords].filter(Boolean).join(','),
      ogType: 'article',
      noscriptLinks: null,
    });
  }

  console.log(`✓ 预渲染完成：${written} 个页面 → ${DIST}`);
  if (!apiOk) {
    console.log('  提示：启动后端后再执行一次，可补齐产品/新闻详情页');
  }
}

main().catch((err) => {
  console.error('✗ 预渲染失败：', err);
  process.exit(1);
});
