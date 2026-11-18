import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
const browser = await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const page = await browser.newPage({viewport:{width:1280,height:960},acceptDownloads:true});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{if(m.type()==='error') console.log('CONSOLE',m.text());});
await page.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.smartphoneWarningDismissed','true');});
const base='http://127.0.0.1:4186/openvolleyscout/';
await page.goto(base);
const raw=[...await fs.readFile('public/samples/new_test.dvw')];
await page.evaluate(async raw=>{
 const {parseDataVolleyFile,mapDataVolleyMatchToOvsProject}=await import('/openvolleyscout/src/features/import/index.ts');
 const {matchRepository}=await import('/openvolleyscout/src/infrastructure/repositories/index.ts');
 const {useAppStore}=await import('/openvolleyscout/src/app/store/app-store.ts');
 const project=mapDataVolleyMatchToOvsProject(parseDataVolleyFile(Uint8Array.from(raw))).project;
 await matchRepository.create(project);useAppStore.getState().setActiveProject(project);
},raw);
await page.goto(base+'#/analysis');
await page.getByRole('tab',{name:'Prestazioni squadre',exact:true}).click();
const group=page.getByRole('group',{name:'Esporta questa scheda',exact:true});
await group.waitFor();
await page.screenshot({path:'tmp/tab-export-qa/toolbar.png',fullPage:false});
for(const format of ['ODS','SVG','PPTX','PDF']){
 const pending=page.waitForEvent('download',{timeout:120000});
 await group.getByRole('button',{name:new RegExp(' · '+format+'$')}).click();
 const download=await pending;const path='tmp/tab-export-qa/team.'+format.toLowerCase();await download.saveAs(path);
 const bytes=await fs.readFile(path);if(bytes.length<100)throw Error('Empty '+format);
 if(['ODS','PPTX'].includes(format)) {const files=unzipSync(bytes);console.log(format,Object.keys(files).length,'entries');}
 if(format==='SVG') {const text=bytes.toString();if(text.includes('foreignObject'))throw Error('Non-vector SVG');console.log('SVG text:',text.includes('Prestazioni squadre'));}
 console.log(format,bytes.length);
 await group.getByRole('button').first().waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('.tab-export button')?.disabled);
}
for(const tab of ['Report gara','Prestazioni atleta','Studio cambio-palla','Analisi incrociata rotazioni','Play-by-play']) {
 await page.getByRole('tab',{name:tab,exact:true}).click();await group.waitFor();
 for(const format of ['ODS','SVG','PPTX','PDF']) {
  const pending=page.waitForEvent('download',{timeout:120000});
  await group.getByRole('button',{name:new RegExp(' · '+format+'$')}).click();
  const download=await pending;
  await download.saveAs('tmp/tab-export-qa/'+tab.replaceAll(' ','-')+'.'+format.toLowerCase());
  await page.waitForFunction(()=>!document.querySelector('.tab-export button')?.disabled);
 }
 console.log('All formats:',tab);
}
await page.getByRole('tab',{name:'Analisi video',exact:true}).click();
if(await group.count())throw Error('Statistics export shown for video');
console.log('ERRORS',JSON.stringify(errors));
await browser.close();
