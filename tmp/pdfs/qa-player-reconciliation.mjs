import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:'/home/napo/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'});
const results=[];
for(const action of ['merge','distinct']){
 const context=await browser.newContext({viewport:{width:1200,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('openvolleyscout.locale','it');localStorage.setItem('openvolleyscout.smartphoneWarningDismissed','true');});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text());});
 await page.goto('http://127.0.0.1:4173/openvolleyscout/');
 await page.evaluate(async()=>{
  const {parseDataVolleyFile,mapDataVolleyMatchToOvsProject}=await import('/openvolleyscout/src/features/import/index.ts');
  const {teamRepository}=await import('/openvolleyscout/src/infrastructure/repositories/index.ts');
  const text=await(await fetch('/openvolleyscout/samples/new_test.dvw')).text();
  const {project}=mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text));
  const player=project.homeSelection.roster[0];
  const saved=await teamRepository.create({name:project.homeSelection.teamName,players:[{...player,id:'saved-person',jerseyNumber:99}]});
  window.qaReconciliation={name:player.firstName+' '+player.lastName,jersey:player.jerseyNumber,teamId:saved.team.id};
 });
 await page.goto('http://127.0.0.1:4173/openvolleyscout/#/load-data');
 await page.locator('input[type=file]').first().setInputFiles('public/samples/new_test.dvw');
 const panel=page.getByRole('region',{name:'Riconcilia identità dei giocatori'});await panel.waitFor();
 const confirm=page.getByRole('button',{name:'Conferma import',exact:true});
 if(!await confirm.isDisabled())throw Error('Unresolved reconciliation can be imported');
 const select=panel.locator('select').first();
 if(action==='merge'){
  const value=await select.locator('option[value^="merge:"]').first().getAttribute('value');await select.selectOption(value);
 }else{
  await select.selectOption('distinct');
  if(!await confirm.isDisabled())throw Error('Distinct player without details accepted');
  await panel.getByLabel('Anno di nascita').fill('2004');
  await panel.getByLabel('Nota identificativa').fill('Settore giovanile');
 }
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Reconciliation overflow on mobile');
 await page.screenshot({path:`tmp/pdfs/reconciliation-${action}.png`,fullPage:true});
 await confirm.click();
 await page.waitForFunction(async()=>{const {matchRepository}=await import('/openvolleyscout/src/infrastructure/repositories/index.ts');return(await matchRepository.list()).length===1;});
 const result=await page.evaluate(async action=>{
  const {matchRepository,teamRepository}=await import('/openvolleyscout/src/infrastructure/repositories/index.ts');
  let project; for(let attempt=0;attempt<60;attempt++){[project]=await matchRepository.list();if(project)break;await new Promise(resolve=>setTimeout(resolve,200));}
  if(!project)throw Error('Import did not finish: '+document.body.innerText.slice(-6000));
  const team=await teamRepository.getById(window.qaReconciliation.teamId);
  const matches=team.roster.players.filter(p=>p.firstName+' '+p.lastName===window.qaReconciliation.name);
  const imported=project.homeSelection.roster[0];
  if(imported.jerseyNumber!==window.qaReconciliation.jersey)throw Error('Match jersey changed');
  if(action==='merge'&&(matches.length!==1||imported.id!=='saved-person'))throw Error('Chosen identity not linked');
  if(action==='distinct'&&(matches.length!==2||!matches.some(p=>p.birthYear===2004&&p.notes==='Settore giovanile')))throw Error('Distinct identity details not saved');
  return{action,identities:matches.length,matchJersey:imported.jerseyNumber};
 },action);
 if(errors.length)throw Error(errors.join('\n'));results.push(result);await context.close();
}
console.log(JSON.stringify(results));await browser.close();
