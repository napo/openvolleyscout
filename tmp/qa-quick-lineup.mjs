import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.domainMoveNotice.dismissedOn',new Date().toISOString().slice(0,10));});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/match');
await page.locator('.quick-start').waitFor();
await page.locator('input.team-name-input').fill('Squadra QA');
await page.getByRole('button',{name:'Avanti',exact:true}).click();
await page.getByRole('button',{name:'Avanti',exact:true}).click();
await page.locator('.quick-start__court').waitFor();
const sizes=[];
for(const [width,height] of [[320,568],[360,800],[390,844],[568,320],[844,390],[1280,900]]){
 await page.setViewportSize({width,height});
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.quick-start *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}));
 sizes.push({width,height,...dimensions});
 if(process.env.OVS_VERIFY_LAYOUT==='true'){
  assert(dimensions.document<=width,JSON.stringify(sizes));
  for(const input of await page.locator('.quick-start__slot-input').all()){
   const box=await input.boundingBox();assert(box.x>=0&&box.x+box.width<=width);
  }
 }
 await page.screenshot({path:`tmp/quick-lineup-${width}.png`});
}
console.log(JSON.stringify(sizes,null,2));
if(process.env.OVS_VERIFY_LAYOUT==='true'){
 await page.setViewportSize({width:320,height:568});
 for(const position of [1,2,3,4,5,6])await page.getByLabel(`Numero di maglia in posizione ${position}`,{exact:true}).fill(String(position));
 await page.locator('.quick-start__slot--libero input').nth(0).fill('7');await page.locator('.quick-start__slot--libero input').nth(1).fill('8');
 await page.locator('.quick-start__setter input').first().check();
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 await page.getByRole('button',{name:'Indietro',exact:true}).click();
 assert.equal(await page.getByLabel('Numero di maglia in posizione 1',{exact:true}).inputValue(),'1');
 assert.equal(await page.locator('.quick-start__slot--libero input').nth(1).inputValue(),'8');
 assert(await page.locator('.quick-start__setter input').first().isChecked());
 await page.locator('.quick-start__slot--libero input').nth(1).fill('1');
 await page.getByRole('button',{name:'Avanti',exact:true}).click();
 assert(await page.getByRole('alert').filter({hasText:'Numero ripetuto'}).isVisible());
 assert(await page.locator('.quick-start__court').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Lineup input, setter, liberos, back/forward and duplicate validation passed.');
}
assert.deepEqual(errors,[]);await browser.close();
