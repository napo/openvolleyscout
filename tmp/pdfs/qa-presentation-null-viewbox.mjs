import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:1200,height:1000},acceptDownloads:true});
await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.experimentalFeatures.opponentReports','true');localStorage.setItem('openvolleyscout.smartphoneWarningDismissed','true');});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',async msg=>{if(msg.type()==='error')console.log('BROWSER',msg.text(),await Promise.all(msg.args().map(a=>a.evaluate(v=>v instanceof Error?{message:v.message,stack:v.stack}:String(v)).catch(()=>''))));});
await page.goto('http://127.0.0.1:4175/openvolleyscout/');
const raw=await Promise.all((await fs.readdir('/home/napo/Desktop/davide')).filter(n=>n.endsWith('.dvw')).map(async n=>[...await fs.readFile('/home/napo/Desktop/davide/'+n)]));
await page.evaluate(async raw=>{
 const {parseDataVolleyFile,mapDataVolleyMatchToOvsProject}=await import('/openvolleyscout/src/features/import/index.ts');
 const {matchRepository,opponentReportRepository}=await import('/openvolleyscout/src/infrastructure/repositories/index.ts');
 const {createOpponentReport}=await import('/openvolleyscout/src/domain/opponent-report/types.ts');
 const {buildProjectMatchStats}=await import('/openvolleyscout/src/features/scouting/model/project-match-stats.ts');
 const {getMatchRoster}=await import('/openvolleyscout/src/domain/match/helpers.ts');
 const {computeAttackingReportMetrics}=await import('/openvolleyscout/src/features/opponent-reports/model/attacking-metrics.ts');
 const projects=raw.map(bytes=>mapDataVolleyMatchToOvsProject(parseDataVolleyFile(Uint8Array.from(bytes))).project);
 for(const p of projects)await matchRepository.create(p);
 const project=projects[0];
 await matchRepository.create(project);
 const stats=buildProjectMatchStats(project);const side='away';
 const metrics=computeAttackingReportMetrics([{matchId:project.metadata.id,side,events:project.events,rallies:stats.rallyStats,rotationStats:stats.rotationStats[side],roster:getMatchRoster(project,side)}]);
 const report=createOpponentReport({id:'options-qa',title:'Fenerbahçe QA',opponent:{name:'FENERBAHÇE MEDICANA'}});
 report.matchIds=projects.map(p=>p.metadata.id);report.draftStatus='editing';
 report.boardPieceIds=['keys:main','reception:serve-targets',...metrics.setters.flatMap(s=>['positive','negative'].map(b=>`setter:${s.player.key}:${b}`)),...metrics.attackers.map(a=>`attacker:${a.player.key}`)];
 await opponentReportRepository.save(report);
},raw);
await page.goto('http://127.0.0.1:4175/openvolleyscout/#/opponent-reports/options-qa');


await page.getByRole('navigation',{name:'Componenti del foglio'}).waitFor();
const nav=page.getByRole('navigation',{name:'Componenti del foglio'});
await nav.getByRole('button',{name:'Appunti dello staff',exact:true}).click();
const staff=page.getByRole('region',{name:'Appunti dello staff',exact:true});
await staff.getByRole('textbox').first().fill('STAFF EDIT: close the diagonal and cover short tips.');
await page.waitForTimeout(900);await page.reload();await nav.waitFor();
await nav.getByRole('button',{name:'Appunti dello staff',exact:true}).click();
if(await staff.getByRole('textbox').first().inputValue()!=='STAFF EDIT: close the diagonal and cover short tips.')throw Error('Staff edit not saved');
await page.evaluate(()=>{document.fonts.load=()=>Promise.reject(new Error('QA blocked font download'));
 const descriptor=Object.getOwnPropertyDescriptor(SVGMarkerElement.prototype,'viewBox');
 if(!descriptor?.get)throw Error('Cannot emulate null marker viewBox');
 Object.defineProperty(SVGMarkerElement.prototype,'viewBox',{configurable:true,get(){
   return this.hasAttribute('viewBox')?descriptor.get.call(this):{baseVal:null};
 }});});
const menu=page.locator('details.tactical-export').nth(1);await menu.locator('summary').click();
for(const [label,extension] of [['PPTX','pptx'],['ODP','odp']]){
 const pending=page.waitForEvent('download',{timeout:120000});await menu.getByRole('button',{name:label,exact:true}).click();
 const download=await pending;const target=`tmp/pdfs/all-matches.${extension}`;await download.saveAs(target);
 const entries=unzipSync(await fs.readFile(target));
 const xml=Object.entries(entries).filter(([name])=>name.endsWith('.xml')).map(([,v])=>strFromU8(v)).join('');
 if(!xml.replace(/<text:s(?: text:c="1")?\s*\/>/g,' ').includes('STAFF EDIT: close the diagonal and cover short tips.'))throw Error('Staff edits missing in '+extension);
 console.log(extension+' exported with edited automatic staff notes');
}
const markers=await page.evaluate(async()=>{
 const {svgPagesToPresentationScene}=await import('/openvolleyscout/src/features/opponent-reports/model/report-presentation-scene.ts');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><marker id="qa-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L4 2 L0 4 z" fill="#111827"/></marker></defs><line x1="10" y1="20" x2="90" y2="20" stroke="#111827" stroke-width="8" marker-end="url(#qa-arrow)"/></svg>`;
 const scene=await svgPagesToPresentationScene([svg],100,100);
 const head=scene.pages[0].find(o=>o.kind==='path'&&o.closed);
 if(!head)throw Error('Arrow head missing');
 const extent=Math.max(...head.points.map(p=>p.x))-Math.min(...head.points.map(p=>p.x));
 if(extent!==4)throw Error(`Arrow head grew to ${extent}`);
 return {arrowWidth:extent};
});
console.log(JSON.stringify({errors,markers}));await browser.close();
