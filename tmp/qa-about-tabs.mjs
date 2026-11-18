import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await context.addInitScript(() => {
  localStorage.setItem('openvolleyscout.locale', 'it');
  localStorage.setItem('openvolleyscout.domainMoveNotice.dismissedOn',new Date().toISOString().slice(0,10));
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/about');
await page.getByRole('tablist').waitFor();
const results=[];
for (const [width,height] of [[320,568],[390,844],[768,1024],[844,390],[568,320],[1280,900]]) {
  await page.setViewportSize({width,height});
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'),'true');
    assert.equal(await page.getByRole('tabpanel').count(),1);
    const size=await page.evaluate(()=>{
      const panel=document.querySelector('.about-page__panel:not([hidden])');
      const tabs=document.querySelector('.about-page__tabs');
      return {documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,panelBottom:panel.getBoundingClientRect().bottom,panelHeight:panel.clientHeight,tabsBottom:tabs.getBoundingClientRect().bottom,tabWidth:tabs.clientWidth,tabScrollWidth:tabs.scrollWidth,panelWidth:panel.clientWidth,panelScrollWidth:panel.scrollWidth};
    });
    assert(size.documentWidth<=width,JSON.stringify({width,height,...size}));
    assert(size.documentHeight<=height+1,JSON.stringify({width,height,...size}));
    assert(size.panelBottom<=height+1,JSON.stringify({width,height,...size}));
    assert(size.panelHeight>60,JSON.stringify({width,height,...size}));
    assert(size.tabScrollWidth<=size.tabWidth,JSON.stringify({width,height,...size}));
    assert(size.panelScrollWidth<=size.panelWidth,JSON.stringify({width,height,...size}));
  }
  await page.getByRole('tab',{name:'Tutorial',exact:true}).click();
  assert.equal(await page.locator('.about-tutorials__card:visible').count(),9);
  const bounds=await page.getByRole('tablist').boundingBox();
  await page.getByRole('tabpanel').evaluate(el=>el.scrollTo(0,el.scrollHeight));
  assert.deepEqual(await page.getByRole('tablist').boundingBox(),bounds);
  await page.getByRole('tabpanel').evaluate(el=>el.scrollTo(0,0));
  await page.screenshot({path:`tmp/about-tabs-${width}x${height}.png`});
  results.push(`${width}x${height}`);
}
await page.setViewportSize({width:390,height:844});
await page.getByRole('tab',{name:'Progetto',exact:true}).click();
await page.keyboard.press('ArrowRight');
assert.equal(await page.getByRole('tab',{name:'Tutorial',exact:true}).getAttribute('aria-selected'),'true');
await page.keyboard.press('End');
assert.equal(await page.getByRole('tab',{name:'Crediti e licenza',exact:true}).getAttribute('aria-selected'),'true');
await page.keyboard.press('Home');
assert.equal(await page.getByRole('tab',{name:'Progetto',exact:true}).getAttribute('aria-selected'),'true');
await page.getByRole('tab',{name:'Contatti',exact:true}).click();
await page.reload();
await page.getByRole('tablist').waitFor();
assert.equal(await page.getByRole('tab',{name:'Contatti',exact:true}).getAttribute('aria-selected'),'true');
await page.getByRole('tab',{name:'Tutorial',exact:true}).click();
await page.locator('.about-tutorials__card').nth(1).click();
await page.getByRole('dialog').waitFor();
await page.keyboard.press('Escape');
await page.waitForURL('**/#/about?tab=tutorials');
assert.equal(await page.getByRole('tab',{name:'Tutorial',exact:true}).getAttribute('aria-selected'),'true');
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/tutorial/tag');
await page.getByRole('dialog').waitFor();
await page.keyboard.press('Escape');
await page.waitForURL('**/#/about?tab=tutorials');
assert.equal(await page.getByRole('tabpanel').count(),1);
// A visible global notice should take space without pushing the panel off screen.
await page.evaluate(()=>localStorage.removeItem('openvolleyscout.domainMoveNotice.dismissedOn'));
await page.reload();
await page.getByRole('tablist').waitFor();
const bottom=await page.getByRole('tabpanel').evaluate(el=>el.getBoundingClientRect().bottom);
assert(bottom<=844);
assert.deepEqual(errors,[]);
console.log(JSON.stringify({sizes:results,keyboard:'passed',reload:'passed',tutorialLinks:'passed',notice:'passed',errors}));
await browser.close();
