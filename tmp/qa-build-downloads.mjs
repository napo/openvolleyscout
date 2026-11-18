import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const release=JSON.parse(await fs.readFile('/tmp/ovs-latest-release.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.domainMoveNotice.dismissedOn',new Date().toISOString().slice(0,10));});
let requests=0;let fail=false;
await context.route('https://api.github.com/repos/napo/openvolleyscout/releases/latest',async route=>{requests++;await route.fulfill({status:fail?503:200,json:fail?{}:release});});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/about');
await page.getByRole('tab',{name:'Download',exact:true}).waitFor();assert.equal(requests,0);
await page.getByRole('tab',{name:'Download',exact:true}).click();
await page.getByRole('status').filter({hasText:'Ultima release:'}).waitFor();
assert.equal(await page.locator('.about-downloads__platform').count(),4);
assert.equal(await page.locator('.about-downloads__links a').count(),8);
for(const link of await page.locator('.about-downloads__links a').all()){
 const href=await link.getAttribute('href');assert(release.assets.some(asset=>asset.browser_download_url===href));
}
for(const [width,height] of [[320,568],[390,844],[844,390],[568,320],[1280,900]]){
 await page.setViewportSize({width,height});
 const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,bottom:document.querySelector('[role="tabpanel"]:not([hidden])').getBoundingClientRect().bottom,tabWidth:document.querySelector('[role="tablist"]').clientWidth,tabScroll:document.querySelector('[role="tablist"]').scrollWidth}));
 assert(dimensions.width<=width,JSON.stringify(dimensions));assert(dimensions.height<=height+1,JSON.stringify(dimensions));assert(dimensions.bottom<=height+1);assert(dimensions.tabScroll<=dimensions.tabWidth);
 assert.equal(await page.getByRole('tab').count(),7);
 await page.screenshot({path:`tmp/build-downloads-${width}x${height}.png`});
}
fail=true;await page.reload();
await page.getByRole('status').filter({hasText:'Non è possibile elencare'}).waitFor();
assert.equal(await page.locator('.about-downloads__links a').count(),0);
assert.equal(await page.getByRole('link',{name:'Tutte le release e le note di versione'}).getAttribute('href'),'https://github.com/napo/openvolleyscout/releases');
assert.deepEqual(errors,[]);
console.log(JSON.stringify({platforms:4,downloads:8,sizes:5,fallback:'passed',lazyFetch:'passed',errors}));await browser.close();
