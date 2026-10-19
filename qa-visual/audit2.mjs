// QA 深度审计：表单可用性、文本溢出、点击目标、重叠、粘性导航、新闻网格、E2E 提交
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = 'C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';
const out = {};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---------- 1. 新闻网格列数 ----------
for (const vp of [{ n: 'pc1440', w: 1440, h: 900 }, { n: 'tablet768', w: 768, h: 1024 }, { n: 'mobile375', w: 375, h: 812 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 500 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/news', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);
  const g = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a[href*="/news/"]'));
    const tops = {};
    cards.forEach((c) => { const t = Math.round(c.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; });
    return { cardCount: cards.length, perRow: Math.max(0, ...Object.values(tops)) };
  });
  out[`news-grid@${vp.n}`] = g;
  await ctx.close();
}

// ---------- 2. PC 粘性导航 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? getComputedStyle(h).position : null;
  });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const h = document.querySelector('header');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { position: getComputedStyle(h).position, top: Math.round(r.top), stillVisible: r.top >= -2 && r.top < 200 };
  });
  out.stickyNav = { headerPositionBefore: before, afterScroll: after };
  await ctx.close();
}

// ---------- 3. 留言表单可用性 (375) + 文本溢出 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(700);
  const fields = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, textarea, select, button[type="submit"], button'));
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute('type') || '',
        name: e.getAttribute('name') || e.getAttribute('id') || '',
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
        overflowsViewport: r.right > 375 + 1,
      };
    }).filter((x) => x.w > 0 || x.tag === 'textarea');
  });
  out.contactFormMobile = fields;
  await ctx.close();
}

// ---------- 4. 全局文本溢出 / 元素重叠检测（多页） ----------
out.overlapScan = {};
for (const p of ['/', '/about', '/products', '/news', '/contact']) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    // 文本节点溢出其父容器
    const textOverflow = [];
    document.querySelectorAll('h1,h2,h3,p,span,a,button,li').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const st = getComputedStyle(el);
        if (st.overflow === 'visible') {
          textOverflow.push({ tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth });
        }
      }
    });
    const de = document.documentElement;
    return { hScroll: de.scrollWidth > de.clientWidth + 1, overflowPx: de.scrollWidth - de.clientWidth, textOverflow: textOverflow.slice(0, 8) };
  });
  out.overlapScan[p] = res;
  await ctx.close();
}

// ---------- 5. E2E 留言提交（成功 + 校验失败） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);

  const snap = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    return inputs.map((i) => ({ name: i.getAttribute('name') || i.getAttribute('id') || '', type: i.getAttribute('type') || i.tagName.toLowerCase(), placeholder: i.getAttribute('placeholder') || '' }));
  });
  out.formFields = snap;

  // 先测校验失败：只填 name+content，不填 phone/email
  const fill = async (sel, val) => { await page.fill(sel, val).catch(() => {}); };
  // 猜测 name 属性
  const names = snap.map((s) => s.name);
  const nameSel = '[name="name"], #name';
  const phoneSel = '[name="phone"], #phone';
  const emailSel = '[name="email"], #email';
  const contentSel = '[name="content"], #content, textarea';
  await fill(nameSel, '张三');
  await fill(contentSel, '这是一条用于视觉走查测试的留言内容。');
  await page.screenshot({ path: 'E:/aicode/docs/screenshots/contact-form-filled-pc1440.png', fullPage: false });
  const submitBtn = 'button[type="submit"]';
  await page.click(submitBtn).catch(() => {});
  await page.waitForTimeout(1500);
  const errState = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    return {
      hasToast: /成功|提交成功|感谢|已收到|error|错误|请/.test(bodyText),
      snippets: (bodyText.match(/.{0,20}(请|错误|失败|成功|必填|至少).{0,20}/g) || []).slice(0, 6),
    };
  });
  out.validationFail = errState;
  await page.screenshot({ path: 'E:/aicode/docs/screenshots/contact-form-validation-pc1440.png', fullPage: false });

  // 再测成功：补 phone
  await fill(phoneSel, '13800138000');
  await page.click(submitBtn).catch(() => {});
  await page.waitForTimeout(2000);
  const okState = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const inputs = Array.from(document.querySelectorAll('input, textarea')).map((i) => i.value);
    return {
      snippets: (bodyText.match(/.{0,20}(成功|感谢|已收到|失败|错误).{0,20}/g) || []).slice(0, 6),
      fieldsAfter: inputs,
      formCleared: inputs.every((v) => !v),
    };
  });
  out.validationPass = okState;
  await page.screenshot({ path: 'E:/aicode/docs/screenshots/contact-form-success-pc1440.png', fullPage: false });
  await ctx.close();
}

await browser.close();
fs.writeFileSync('E:/aicode/docs/screenshots/_audit2.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
