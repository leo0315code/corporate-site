// V1 复测：21 组合横向滚动 diff + 时间轴几何 + 圆点裁切
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = 'C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const PAGES = [
  { key: 'home', path: '/' },
  { key: 'about', path: '/about' },
  { key: 'products', path: '/products' },
  { key: 'product-detail', path: '/products/solution-cloud' },
  { key: 'news', path: '/news' },
  { key: 'news-detail', path: '/news/news-2024-06' },
  { key: 'contact', path: '/contact' },
];
const VPS = [
  { n: 'pc1440', w: 1440, h: 900 },
  { n: 'tablet768', w: 768, h: 1024 },
  { n: 'mobile375', w: 375, h: 812 },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const grid = {};
let worst = { diff: -1 };

for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 500, hasTouch: vp.w < 500 });
  const page = await ctx.newPage();
  for (const pg of PAGES) {
    await page.goto(BASE + pg.path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(450);
    await page.evaluate(() => window.scrollTo(0, 0));
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const sw = Math.max(de.scrollWidth, document.body.scrollWidth);
      const cw = de.clientWidth;
      const off = [];
      document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > cw + 0.5) {
          const st = getComputedStyle(el);
          if (st.overflowX === 'hidden' || st.overflowX === 'auto' || st.overflowX === 'scroll') return;
          off.push({ tag: el.tagName.toLowerCase(), right: Math.round(r.right) });
        }
      });
      return { scrollW: sw, clientW: cw, diff: sw - cw, enemies: off.length };
    });
    grid[`${pg.key}@${vp.n}`] = m;
    if (m.diff > worst.diff) worst = { ...m, page: pg.key, vp: vp.n };
  }
  await ctx.close();
}

// 时间轴几何（375）
let timeline = null;
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/about', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(700);
  timeline = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('ol li'));
    const dots = Array.from(document.querySelectorAll('ol li > span'));
    const divs = Array.from(document.querySelectorAll('div.ml-8'));
    const maxRight = Math.max(...divs.map((d) => Math.round(d.getBoundingClientRect().right)));
    const dotInfo = dots.map((s) => {
      const r = s.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), w2: Math.round(r.width / 2) };
    });
    return {
      itemCount: items.length,
      containerWidth: Math.round(document.querySelector('ol').getBoundingClientRect().width),
      divWidth: divs.length ? Math.round(divs[0].getBoundingClientRect().width) : null,
      divLeft: divs.length ? Math.round(divs[0].getBoundingClientRect().left) : null,
      maxRight,
      withinViewport: maxRight <= 375,
      dots: dotInfo.slice(0, 3),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    };
  });
  await page.screenshot({ path: 'E:/aicode/docs/screenshots/about-mobile375-after-fix.png', fullPage: true });
  await ctx.close();
}

await browser.close();
const res = { generatedAt: new Date().toISOString(), grid, worst, timeline };
fs.writeFileSync('E:/aicode/docs/screenshots/_audit3.json', JSON.stringify(res, null, 2));

console.log('=== 21 组合横向滚动 diff ===');
let maxDiff = 0;
for (const [k, v] of Object.entries(grid)) {
  maxDiff = Math.max(maxDiff, v.diff);
  console.log(k.padEnd(28), `scrollW=${v.scrollW} clientW=${v.clientW} diff=${v.diff}`, v.diff > 0 ? '❌' : '✅');
}
console.log('\n最大 diff =', maxDiff, maxDiff === 0 ? '→ 全部无横向滚动 ✅' : '→ 仍有溢出 ❌');
console.log('\n=== 时间轴几何(375) ===');
console.log(JSON.stringify(timeline, null, 2));
