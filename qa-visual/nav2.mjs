import { chromium } from 'playwright-core';
const CHROME='C:/Users/leo0315/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const b=await chromium.launch({executablePath:CHROME,headless:true});
const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true});
const p=await ctx.newPage();
await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(600);
const m=await p.evaluate(()=>{
  const header=document.querySelector('header');
  const links=Array.from(header.querySelectorAll('a')).map(a=>{
    const r=a.getBoundingClientRect(); const cs=getComputedStyle(a);
    // 检查祖先链是否有 display:none
    let hidden=false, el=a;
    while(el&&el!==document.body){ if(getComputedStyle(el).display==='none'){hidden=true;break;} el=el.parentElement; }
    return {text:a.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height),display:cs.display,ancestorHidden:hidden};
  });
  // header 高度
  const hr=header.getBoundingClientRect();
  return {headerH:Math.round(hr.height), headerW:Math.round(hr.width), links};
});
console.log(JSON.stringify(m,null,2));
await b.close();
