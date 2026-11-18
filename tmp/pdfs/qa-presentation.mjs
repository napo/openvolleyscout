import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:"/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome"});
const context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});
await context.addInitScript(()=>{
  if(!localStorage.getItem('openvolleyscout.locale'))localStorage.setItem('openvolleyscout.locale','it');
  localStorage.setItem('openvolleyscout.experimentalFeatures.opponentReports','true');
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/openvolleyscout/');
await page.evaluate(async()=>{
  const {createOpponentReport}=await import('/openvolleyscout/src/domain/opponent-report/types.ts');
  const {matchProjectDb}=await import('/openvolleyscout/src/infrastructure/db/match-project-db.ts');
  const report=createOpponentReport({id:'booklet-qa',title:'Preparazione di esempio',opponent:{name:'Rivale Blu'}});
  report.draftStatus='editing';report.draftCreatedAt=Date.now();report.boardPieceIds=['keys:main','reception:serve-targets'];
  report.keys=Array.from({length:10},(_,i)=>({id:`key-${i}`,source:'auto',text:'',suggestion:{kind:'receiverSideOut',params:{rotation:'P1',player:'#8',rate:'42%',baseline:'59%',n:48,otherN:56},sample:48}}));
  await matchProjectDb.opponentReports.put(report);
});
await page.goto('http://127.0.0.1:4173/openvolleyscout/#/opponent-reports/booklet-qa');
await page.getByRole('textbox',{name:'1. Indicazione'}).waitFor();
const first=page.getByRole('textbox',{name:'1. Indicazione'});
if(!(await first.inputValue()).includes('valuta la battuta'))throw Error('Italian priorities missing');
await page.getByRole('textbox',{name:'2. Indicazione'}).fill('CONSEGNA MANUALE QA');
await page.getByRole('button',{name:'Sposta su'}).nth(1).click();
if(await first.inputValue()!=='CONSEGNA MANUALE QA')throw Error('Priority order did not update');
await page.getByLabel('Includi nella stampa').first().uncheck();
await page.locator('select').filter({has:page.locator('option[value="custom"]')}).selectOption('custom');
await page.getByLabel('Extra: battute avversarie').check();
await page.screenshot({path:'tmp/pdfs/booklet-editor-desktop.png',fullPage:true});
await page.waitForTimeout(800);
await page.evaluate(()=>localStorage.setItem('openvolleyscout.locale','en'));await page.reload();
await page.getByRole('textbox',{name:'1. Tactical instruction'}).waitFor();
if(await page.getByRole('textbox',{name:'1. Tactical instruction'}).inputValue()!=='CONSEGNA MANUALE QA')throw Error('Coach text changed');
if(!(await page.getByRole('textbox',{name:'2. Tactical instruction'}).inputValue()).includes('consider serving'))throw Error('Automatic language did not update');
if(await page.getByLabel('Include in print').first().isChecked())throw Error('Print selection not persisted');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'tmp/pdfs/booklet-editor-mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile horizontal overflow');
await page.setViewportSize({width:1200,height:1000});
// Build representative native diagrams and exercise the actual PDF export in the browser.
const info=await page.evaluate(async()=>{
 const [{createOpponentReport},{computeOpponentReportMetrics},{computeAttackingReportMetrics},{buildReportView,buildSetterRotationCourtSvg},{DEFAULT_THRESHOLDS},{DEFAULT_RECEPTION_SYSTEM_BLOCK},{en},{buildReportBooklet}]=await Promise.all([
  import('/openvolleyscout/src/domain/opponent-report/types.ts'),import('/openvolleyscout/src/features/opponent-reports/model/report-metrics.ts'),import('/openvolleyscout/src/features/opponent-reports/model/attacking-metrics.ts'),import('/openvolleyscout/src/features/opponent-reports/model/report-view.ts'),import('/openvolleyscout/src/features/opponent-reports/model/traffic-light.ts'),import('/openvolleyscout/src/config/systems/reception-defaults.ts'),import('/openvolleyscout/src/i18n/locales/en.ts'),import('/openvolleyscout/src/features/opponent-reports/model/report-booklet.ts')]);
 const t=(key,params={})=>(en[key]??key).replace(/{{(\w+)}}/g,(_,k)=>String(params[k]??k));
 const report=createOpponentReport({id:'fixture',title:'QA - dati fittizi',opponent:{name:'Rivale Blu'}});
 const view=buildReportView(report,computeOpponentReportMetrics([]),[],DEFAULT_THRESHOLDS,t,DEFAULT_RECEPTION_SYSTEM_BLOCK,computeAttackingReportMetrics([]));
 const svg=async key=>await(await fetch(`/openvolleyscout/tmp/pdfs/native/${key}.svg`)).text();
 const p=id=>({key:String(id),jersey:String(id),name:`Player ${id}`});
 const table={columns:['Metric','Value'],rows:[[{text:'Points'},{text:'50% (20/40)'}]]};
 const ids=[7,9,14,3,11,6];
 view.keys=Array.from({length:5},(_,i)=>({text:`${i+1}. Prepare the agreed serving and blocking reference. Observed side-out is 42% (20/48), versus 59% (33/56) in the same rotation.`,source:'confirmed'}));
 const base=[2,7,14,9,3,11];
 view.serveTargets.formations=Array.from({length:6},(_,i)=>({title:`P${i+1}`,formation:{rotation:i+1,receptions:40,receptionPositive:{count:20,total:40,rate:.5},dots:base.map((id,k)=>({position:k+1,x:[80,80,50,20,20,50][k],y:[70,23,15,23,70,78][k],jersey:String(id),name:'',band:'none'}))}}));
 view.attackers=await Promise.all(ids.map(async(id,i)=>({player:p(id),courtSvg:await svg(`attack-${i}`),courtSample:'4 matches · 40 attacks',highlights:table,performance:table,distribution:table,notes:''})));
 const band={attempts:40,matches:4,zones:[4,3,2,6].map((zone,i)=>({zone,attempts:[16,12,8,4][i],kills:[8,6,4,1][i],matches:4,players:[{player:p([7,14,9,3][i]),attempts:[16,12,8,4][i],kills:4,matches:4}]}))};
 view.setter.groups=[{player:p(2),attempts:480,bands:['positive','negative'].map(key=>({key,title:key==='positive'?'Reception # / +':'Reception ! / -',summary:'Zone 4: 40% (16/40)',players:ids.map(p),courts:Array.from({length:6},(_,i)=>({rotation:i+1,svg:buildSetterRotationCourtSvg(i+1,band,band,4,t),sample:'4 matches · 40 sets',predictability:{text:'40%'}}))}))}];
 view.serve.servers=await Promise.all(ids.map(async(id,i)=>({player:p(id),courtSvg:await svg(`serve-${i}`),courtSample:'4 matches · 40 serves',highlights:table})));
 window.qaPlans={};
 for(const format of ['compact','extended','custom']){
  report.booklet={...report.booklet,format,includeServe:format==='custom'};
  window.qaPlans[format]=buildReportBooklet(report,view,t,'4 matches · 15 sets · 360 actions');
 }
 window.qaT=t;window.qaView=view;window.qaReport=report;window.qaBand=band;
 return Object.fromEntries(Object.entries(window.qaPlans).map(([key,plan])=>[key,{pages:plan.pages.length,sheets:plan.sheets}]));
});

const menus=page.locator('details.tactical-export');
if(await menus.count()!==3)throw Error('Expected three export menus');
await menus.nth(2).evaluate(element=>{element.open=true;});
if(await page.locator('.tactical-svg-help').count()!==1)throw Error('SVG help missing');
for(const label of ['Canva','SVG-edit','Inkscape'])if(!(await page.locator('.tactical-svg-help').innerText()).includes(label))throw Error('SVG editor link missing');
await menus.nth(1).evaluate(element=>{element.open=true;});
await page.screenshot({path:'tmp/pdfs/export-menus.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Open menus overflow on mobile');
await page.setViewportSize({width:1200,height:1000});
for(const name of ['A4','Booklet','Booklet · Extended']){
 const download=page.waitForEvent('download');await menus.nth(1).getByRole('button',{name,exact:true}).click();
 await(await download).saveAs(`tmp/pdfs/qa-ui-${name==='A4'?'a4':name==='Booklet'?'compact':'extended'}.pdf`);
}
for(const format of ['PPTX','ODP']){
 const download=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();
 const file=await download;await file.saveAs(`tmp/pdfs/qa-ui.${format.toLowerCase()}`);
}
{
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Booklet · SVG (ZIP)',exact:true}).click();
 const file=await download;await file.saveAs('tmp/pdfs/qa-ui-svg.zip');
}
// Verify real full-size A4 output from the shared layout with rich tables.
{
 const download=page.waitForEvent('download');
 const counts=await page.evaluate(async()=>{
  const {buildReportBooklet}=await import('/openvolleyscout/src/features/opponent-reports/model/report-booklet.ts');
  const {exportReportBooklet}=await import('/openvolleyscout/src/features/opponent-reports/model/opponent-report-pdf.ts');
  const plan=buildReportBooklet(window.qaReport,window.qaView,window.qaT,'4 matches · 360 actions',{a4:true});
  await exportReportBooklet(plan,false,'qa-rich.pdf');
  return {pages:plan.pages.length,width:plan.width,height:plan.height};
 });
 await(await download).saveAs('tmp/pdfs/qa-rich-a4.pdf');console.log('A4',counts);
}
for(const format of ['pptx','odp']){
 const download=page.waitForEvent('download');
 await page.evaluate(async format=>{
  const {exportReportPresentation}=await import('/openvolleyscout/src/features/opponent-reports/model/report-presentation-export.ts');
  await exportReportPresentation(window.qaPlans.compact,format,`qa-presentation.pdf`,'QA - native objects');
 },format);
 const file=await download;await file.saveAs(`tmp/pdfs/${file.suggestedFilename()}`);
}
const scene=await page.evaluate(async()=>{const {svgPagesToPresentationScene}=await import('/openvolleyscout/src/features/opponent-reports/model/report-presentation-scene.ts');return await svgPagesToPresentationScene(window.qaPlans.compact.pages,419.528,595.276);});
await fs.writeFile('tmp/pdfs/presentation-scene.json',JSON.stringify(scene));
await fs.writeFile('tmp/pdfs/presentation-qa-result.json',JSON.stringify({info,errors},null,2));
console.log(JSON.stringify({info,errors}));await browser.close();
