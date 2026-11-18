import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.domainMoveNotice.dismissedOn',new Date().toISOString().slice(0,10));});
const page=await context.newPage();
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/about');
await page.getByRole('tab',{name:'Progetto',exact:true}).waitFor();
assert.equal(await page.getByRole('tab').count(),6);
assert.deepEqual(await page.getByRole('tabpanel').getByRole('heading',{level:2}).allTextContents(),['OpenVolleyScout','Sostieni lo sviluppo','Stato del progetto']);
assert.equal(await page.getByRole('tabpanel').locator('a[href="https://paypal.me/MNapolitano570"]').count(),1);
await page.getByRole('tab',{name:'Crediti',exact:true}).click();
assert(await page.getByRole('heading',{name:'Contribuire e condividere feedback'}).isVisible());
assert(await page.getByRole('heading',{name:'Sostieni lo sviluppo'}).isVisible());
assert(await page.getByRole('heading',{name:'Ringraziamenti'}).isVisible());
assert.equal(await page.getByRole('tabpanel').locator('a[href="https://paypal.me/MNapolitano570"]').count(),1);
for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]){
 await page.setViewportSize({width,height});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
}
await browser.close();console.log('Donation order, Credits content and responsive layout passed.');
