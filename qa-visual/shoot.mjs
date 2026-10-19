// QA 视觉走查脚本：多分辨率截图 + 响应式检测
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = 'E:/aicode/docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'pc1440', width: 1440, height: 900, dsf: 1 },
  { name: 'tablet768', width: 768, height: 1024, dsf: 1 },
  { name: 'mobile375', width: 375, height: 812, dsf: 2 },
];

const PAGES = [
  { key: 'home', path: '/' },
  { key: 'about', path: '/about' },
  { key: 'products', path: '/products' },
  { key: 'product-detail', path: '/products/solution-cloud' },
  { key: 'news', path: '/news' },
  { key: 'news-detail', path: '/news/news-2024-06' },
  { key: 'contact', path: '/contact' },
];

const report = { generatedAt: new Date().toISOString(), pages: {}, menus: {}, forms: {} };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.width < 500,
    hasTouch: vp.width < 500,
  });
  const page = await ctx.newPage();
  for (const pg of PAGES) {
    const url = BASE + pg.path;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    // 滚动到顶
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    // 横向溢出检测
    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      const scrollW = Math.max(de.scrollWidth, document.body.scrollWidth);
      const clientW = de.clientWidth;
      // 找出所有超出视口右边缘的元素
      const offenders = [];
      const vw = de.clientWidth;
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) {
          // 排除明确允许隐藏溢出的滚动容器
          const style = getComputedStyle(el);
          if (style.overflowX === 'hidden' || style.overflowX === 'auto' || style.overflowX === 'scroll') return;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString().slice(0, 80)) || '',
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      });
      return {
        scrollW,
        clientW,
        hasHScroll: scrollW > clientW + 1,
        overflowPx: scrollW - clientW,
        offenders: offenders.slice(0, 12),
      };
    });

    // 全页截图
    const fullName = `${pg.key}-${vp.name}.png`;
    await page.screenshot({ path: path.join(OUT, fullName), fullPage: true }).catch((e) => {
      report.pages[fullName] = { error: String(e) };
    });

    report.pages[`${pg.key}@${vp.name}`] = {
      url,
      viewport: `${vp.width}x${vp.height}`,
      screenshot: fullName,
      ...metrics,
    };
  }

  // 移动端汉堡菜单检测
  if (vp.width < 500) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    const menuInfo = await page.evaluate(() => {
      // 找汉堡按钮：常用选择器
      const btns = Array.from(document.querySelectorAll('button')).filter((b) => {
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return a.includes('menu') || a.includes('菜单') || a.includes('导航') || b.querySelector('svg');
      });
      return {
        buttonCount: btns.length,
        candidates: btns.slice(0, 5).map((b) => ({
          aria: b.getAttribute('aria-label') || '',
          cls: b.className.toString().slice(0, 100),
          text: (b.textContent || '').trim().slice(0, 20),
        })),
      };
    });
    report.menus.mobile = menuInfo;
    await page.screenshot({ path: path.join(OUT, 'home-mobile375-menu-closed.png'), fullPage: false });
  }
  await ctx.close();
}

// 汉堡菜单开合专项（375）
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);
  // 尝试点击第一个可点击的汉堡（含 svg 的 button）
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find((b) => b.querySelector('svg')) || btns[btns.length - 1];
    if (target) { target.click(); return target.className.toString().slice(0, 120); }
    return null;
  });
  await page.waitForTimeout(600);
  const afterOpen = await page.evaluate(() => {
    const bodyLock = document.body.style.overflow || getComputedStyle(document.body).overflow;
    const htmlLock = document.documentElement.style.overflow;
    // 探测可见的导航链接数量（移动菜单展开后应出现）
    const links = Array.from(document.querySelectorAll('a')).filter((a) => a.getBoundingClientRect().width > 0).length;
    return { bodyOverflow: bodyLock, htmlOverflow: htmlLock, visibleLinks: links };
  });
  await page.screenshot({ path: path.join(OUT, 'home-mobile375-menu-open.png'), fullPage: false });
  report.menus.openTest = { clickedButtonClass: clicked, ...afterOpen };
  await ctx.close();
}

// 首页 Hero 一屏检测 + 网格列数检测
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, dsf: 1, isMobile: vp.width < 500 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const hero = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const cta = document.querySelector('a[href*="contact"], a[href="#/contact"], a[class*="btn"], button');
    const vh = window.innerHeight;
    const h1r = h1 ? h1.getBoundingClientRect() : null;
    const ctar = cta ? cta.getBoundingClientRect() : null;
    return {
      viewportH: vh,
      h1Top: h1r ? Math.round(h1r.top) : null,
      h1Bottom: h1r ? Math.round(h1r.bottom) : null,
      h1Visible: h1r ? h1r.top >= 0 && h1r.bottom <= vh : null,
      ctaBottom: ctar ? Math.round(ctar.bottom) : null,
      ctaVisible: ctar ? ctar.top >= 0 && ctar.bottom <= vh : null,
    };
  });
  report.pages[`home-hero@${vp.name}`] = hero;
  await ctx.close();
}

// 产品/新闻网格列数
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, dsf: 1, isMobile: vp.width < 500 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);
  const grid = await page.evaluate(() => {
    // 找含 grid 的容器中，卡片数量 & 每行数量
    const cards = Array.from(document.querySelectorAll('a[href*="/products/"]'));
    const tops = {};
    cards.forEach((c) => { const t = Math.round(c.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; });
    const rows = Object.values(tops);
    return { cardCount: cards.length, perRow: rows.length ? Math.max(...rows) : 0, rowCounts: rows };
  });
  report.pages[`products-grid@${vp.name}`] = grid;
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, '_audit.json'), JSON.stringify(report, null, 2));
console.log('DONE', JSON.stringify({ pages: Object.keys(report.pages).length, menus: report.menus }, null, 2));
