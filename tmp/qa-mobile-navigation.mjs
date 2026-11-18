import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await context.addInitScript(() => {
  localStorage.setItem('openvolleyscout.locale', 'it');
  localStorage.setItem('openvolleyscout.smartphoneWarningDismissed', 'true');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:4180/openvolleyscout/');
const toggle = page.locator('.app-header__menu-toggle');
const panel = page.locator('#app-navigation-panel');
await toggle.waitFor();
const results = [];
for (const [width,height] of [[320,568],[360,800],[390,844],[768,1024],[844,390],[800,360],[568,320]]) {
  await page.setViewportSize({width,height});
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const size = await panel.evaluate(el => ({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,bottom:el.getBoundingClientRect().bottom}));
  assert(size.scrollWidth <= size.width, `horizontal overflow at ${width}`);
  assert(size.scrollHeight <= size.height+1, `menu needs scrolling at ${width}x${height}`);
  assert(size.bottom <= height, `menu exceeds viewport at ${width}x${height}`);
  assert.equal(await panel.locator('a').count(),9);
  for(const link of await panel.locator('a').all()) {
    assert(await link.isVisible());
    assert((await link.boundingBox()).height >= 43.9, JSON.stringify({width,height,text:await link.innerText(),box:await link.boundingBox(),style:await link.evaluate(el=>({height:getComputedStyle(el).height,minHeight:getComputedStyle(el).minHeight,zoom:getComputedStyle(el).zoom}))}));
  }
  await page.screenshot({path:`tmp/mobile-menu-${width}x${height}.png`});
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert(await toggle.evaluate(el => el === document.activeElement));
  results.push({width,height,...size});
}
await page.setViewportSize({width:390,height:844});
await toggle.click();
await panel.locator('a[href="#/teams"]').click();
await page.waitForURL('**/#/teams');
assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
await toggle.click();
assert.equal(await panel.locator('a[aria-current="page"]').getAttribute('href'),'#/teams');
await panel.locator('a[href="#/teams"]').click();
assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'same-route tap must close');
await toggle.click();
await page.locator('main').first().click({position:{x:5,y:450}});
assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
await page.evaluate(async () => {
  const { useLiveMenuStore } = await import('/openvolleyscout/src/app/store/live-menu-store.ts');
  useLiveMenuStore.getState().setOpen(true);
});
assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
await page.keyboard.press('Escape');
assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
// The live court normally hides the app header. Its menu action must reveal
// the same grid without changing the available height of the court.
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/dev/live-scouting-smoke');
await page.locator('.scouting-stage__body--live-rally').waitFor();
await page.setViewportSize({width:844,height:390});
assert.equal(await page.locator('.app-header').isVisible(),false);
await page.evaluate(async () => {
  const { useLiveMenuStore } = await import('/openvolleyscout/src/app/store/live-menu-store.ts');
  useLiveMenuStore.getState().setOpen(true);
});
await toggle.waitFor();
assert(await panel.isVisible());
assert.equal(await panel.locator('a:visible').count(),9);
const liveSize = await panel.evaluate(el => ({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,bottom:el.getBoundingClientRect().bottom}));
assert(liveSize.scrollWidth <= liveSize.width);
assert(liveSize.scrollHeight <= liveSize.height+1);
assert(liveSize.bottom <= 390);
await page.screenshot({path:'tmp/mobile-menu-live.png'});
await toggle.click();
assert.equal(await page.locator('.app-header').isVisible(),false);
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/teams');
await page.setViewportSize({width:1280,height:900});
assert.equal(await toggle.isVisible(),false);
assert(await panel.isVisible());
assert.equal(await panel.locator('a:visible').count(),9);
await page.screenshot({path:'tmp/mobile-menu-desktop.png'});
assert.deepEqual(errors,[]);
console.log(JSON.stringify({results,routeNavigation:'passed',dismiss:'passed',liveMenuStore:'passed',desktop:'passed',errors},null,2));
await browser.close();
