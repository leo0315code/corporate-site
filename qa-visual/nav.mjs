import { chromium } from 'playwright-core';
const CHROME='C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:CHROME,headless:true});
const out={};
for(const vp of [{n:'pc1440',w:1440,h:900},{n:'mobile375',w:375,h:812}]){
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.w<500});
  const p=await ctx.newPage();
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(600);
  out[vp.n]=await p.evaluate(()=>{
    // 顶部导航区内的链接
    const header=document.querySelector('header');
    const hLinks=header?Array.from(header.querySelectorAll('a')).filter(a=>a.getBoundingClientRect().width>0 && a.getBoundingClientRect().height>0).map(a=>a.textContent.trim()):[];
    const ham=Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||'').includes('菜单'));
    return {headerVisibleLinks:hLinks, hamburgerVisible: !!(ham && ham.getBoundingClientRect().width>0), sticky: header?getComputedStyle(header).position:null};
  });
  await ctx.close();
}
// 汉堡点击后关闭测试
{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(600);
  const open=await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>(x.getAttribute('aria-label')||'').includes('菜单'));b&&b.click();return !!b;});
  await p.waitForTimeout(500);
  const state1=await p.evaluate(()=>({overflow:getComputedStyle(document.body).overflow, ariaLabel:(Array.from(document.querySelectorAll('button')).find(x=>(x.getAttribute('aria-label')||'').includes('菜单'))||{}).getAttribute?.('aria-label')}));
  // 再点一次（关闭）
  await p.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>(x.getAttribute('aria-label')||'').match(/菜单|关闭/));b&&b.click();});
  await p.waitForTimeout(500);
  const state2=await p.evaluate(()=>({overflow:getComputedStyle(document.body).overflow, ariaLabel:(Array.from(document.querySelectorAll('button')).find(x=>(x.getAttribute('aria-label')||'').match(/菜单|关闭/))||{}).getAttribute?.('aria-label')}));
  out.hamburgerToggle={opened:open,afterOpen:state1,afterClose:state2};
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out,null,2));
