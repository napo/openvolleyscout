import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:744,height:1133},hasTouch:true,isMobile:true});
await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.liveScoutingOnboardingSeen','true');localStorage.setItem('openvolleyscout.domainMoveNotice.dismissedOn',new Date().toISOString().slice(0,10));});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4180/openvolleyscout/#/match');
await page.locator('input.team-name-input').fill('Squadra iPad mini');
await page.getByRole('button',{name:'Avanti',exact:true}).click();await page.getByRole('button',{name:'Avanti',exact:true}).click();
for(const position of [1,2,3,4,5,6])await page.getByLabel(`Numero di maglia in posizione ${position}`,{exact:true}).fill(String(position));
await page.locator('.quick-start__setter input').first().check();
await page.getByRole('button',{name:'Avanti',exact:true}).click();
await page.getByRole('button',{name:'Squadra iPad mini',exact:true}).click();await page.getByRole('button',{name:'Avanti',exact:true}).click();
await page.locator('.quick-start__levels').getByRole('button',{name:/^Campo/}).click();
await page.getByRole('button',{name:'Inizia la rilevazione',exact:true}).click();
await page.locator('.scouting-stage__body--live-rally').waitFor();
await page.locator('.live-rally-stage--vertical').waitFor();
await page.screenshot({animations:'disabled',path:'tmp/tablet-portrait-initial.png'});
console.log(JSON.stringify(await page.evaluate(()=>({screen:document.querySelector('.scouting-screen').className,container:document.querySelector('.scouting-screen__container').className,boxes:[...document.querySelectorAll('.scouting-screen__header,.scouting-court,.live-scouting-toolbar,.match-code-list-panel,.opponent-attack-panel,.live-video-panel')].map(el=>({class:el.className,rect:el.getBoundingClientRect().toJSON()}))})),null,2));
if(process.env.OVS_VERIFY_TABLET==='true'){
 for(const [width,height] of [[744,1133],[768,1024],[820,1180],[834,1194],[1024,1366]]){
  await page.setViewportSize({width,height});
  await page.locator('.scouting-screen--tablet-portrait').waitFor();
  assert.equal(await page.locator('.scouting-screen__container--vertical-court').count(),0);
  assert(await page.locator('.phone-live-header').isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
  const box=await page.locator('.scouting-court').boundingBox();assert(box.width>200&&box.height>400,JSON.stringify(box));
  const toolbar=await page.locator('.live-scouting-toolbar').boundingBox();assert(toolbar.y>=box.y+box.height-1);assert(toolbar.y+toolbar.height<=height+1);
  await page.screenshot({animations:'disabled',path:`tmp/tablet-portrait-${width}.png`});
 }
}

if(process.env.OVS_VERIFY_TABLET==='true') {
 await page.setViewportSize({width:744,height:1133});
 const snapshot=()=>page.evaluate(async()=>{
  const {useScoutingStore}=await import('/openvolleyscout/src/features/scouting/model/scouting-store.ts');
  const live=useScoutingStore.getState().liveMatch;
  return {id:live.activeProjectId,set:live.currentSetNumber,rally:live.currentRallyNumber,home:live.homeScore,away:live.awayScore,events:live.eventLog.length,touches:live.currentRallyTouches.length};
 });
 await page.locator('.phone-live-header__button--point').first().click();
 const scored=await snapshot();assert.equal(scored.home+scored.away,1);
 const header=page.locator('.phone-live-header');
 await header.getByRole('button',{name:'Codici DVW',exact:true}).click();
 assert(await page.locator('.match-code-list-panel:not(.match-code-list-panel--collapsed)').isVisible());
 const before=await page.locator('.scouting-screen__live-layout').boundingBox();
 const panel=await page.locator('.match-code-list-panel').boundingBox();
 assert(Math.abs(before.width-panel.width)<2&&Math.abs(before.height-panel.height)<2);
 await header.getByRole('button',{name:'Analisi',exact:true}).click();
 assert.equal(await page.locator('.match-code-list-panel').isVisible(),false);
 assert(await page.locator('.opponent-attack-panel:not(.opponent-attack-panel--collapsed)').isVisible());
 await page.keyboard.press('Escape');assert.equal(await page.locator('.opponent-attack-panel').isVisible(),false);
 await page.locator('.live-video-panel__toggle--collapsed').click();
 assert(await page.locator('.live-video-panel:not(.live-video-panel--hidden)').isVisible());
 await page.locator('.live-video-panel__collapse[aria-label="Mostra o nascondi il pannello video"]').click();
 for(const mode of ['Esperta','Tag','Base','Campo']){
  await header.locator('.scouting-screen__input-mode').getByRole('button',{name:mode,exact:true}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
  if(mode==='Esperta'){
   await header.getByRole('button',{name:'Inserisci codice',exact:true}).click();
   assert(await page.locator('.code-input-panel:not(.code-input-panel--collapsed)').isVisible());
   const inputBox=await page.locator('.code-input-panel').boundingBox();const stageBox=await page.locator('.scouting-screen__live-layout').boundingBox();assert(Math.abs(inputBox.width-stageBox.width)<2&&Math.abs(inputBox.height-stageBox.height)<2);
   await page.locator('.code-input-panel__input').fill('QA');
   await header.getByRole('button',{name:'Inserisci codice',exact:true}).click();
   await header.getByRole('button',{name:'Inserisci codice',exact:true}).click();
   assert.equal(await page.locator('.code-input-panel__input').inputValue(),'QA');
   await page.locator('.code-input-panel__collapse-btn').click();
   assert.equal(await page.locator('.code-input-panel').isVisible(),false);
   const courtBox=await page.locator('.scouting-court').boundingBox();assert(courtBox.width>200&&courtBox.height>400,JSON.stringify(courtBox));
   for(const button of await page.locator('.live-scouting-toolbar button:visible').all())assert((await button.boundingBox()).height>=43.9);
  }
  await page.screenshot({animations:'disabled',path:`tmp/tablet-portrait-mode-${mode}.png`});
 }
 assert.deepEqual(await snapshot(),scored);
 await page.setViewportSize({width:1133,height:744});
 await page.locator('.scouting-screen:not(.scouting-screen--tablet-portrait)').waitFor();
 await page.locator('.live-rally-stage:not(.live-rally-stage--vertical)').waitFor();
 assert(await page.locator('.scouting-screen__header--operational').isVisible());
 assert.deepEqual(await snapshot(),scored);
 await page.screenshot({animations:'disabled',path:'tmp/tablet-landscape-regression.png'});
 await page.setViewportSize({width:744,height:1133});await page.locator('.scouting-screen--tablet-portrait').waitFor();
 assert(await page.locator('.phone-live-header').isVisible());
 await page.setViewportSize({width:390,height:844});await page.locator('.scouting-screen--phone-portrait').waitFor();
 assert.equal(await page.locator('.scouting-screen--tablet-portrait').count(),0);
 assert(await page.locator('.phone-live-header').isVisible());
 assert.deepEqual(await snapshot(),scored);
 console.log('Five portrait tablet sizes, panels, four input modes, scoring, video, rotation and phone regression passed.');
}
assert.deepEqual(errors,[]);await browser.close();
