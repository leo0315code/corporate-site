import { chromium } from 'playwright-core';
const CHROME='C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:CHROME,headless:true});
const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true});
const p=await ctx.newPage();
await p.goto('http://localhost:5173/about',{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(700);
const m=await p.evaluate(()=>{
  const inner=document.querySelector('div.ml-8');
  if(!inner) return {err:'no div.ml-8'};
  const li=inner.closest('li');
  const ol=inner.closest('ol');
  const box=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return {w:Math.round(r.width),l:Math.round(r.left),r:Math.round(r.right),cls:e.className.toString().slice(0,80)};};
  const cs=getComputedStyle(inner);
  return {
    viewport:375, docScrollW:document.documentElement.scrollWidth, docClientW:document.documentElement.clientWidth,
    container:box(ol?ol.parentElement:null), ol:box(ol), li:box(li), innerDiv:box(inner),
    innerMarginLeft:cs.marginLeft, innerWidth:cs.width, innerBoxSizing:cs.boxSizing,
  };
});
console.log(JSON.stringify(m,null,2));
await b.close();
