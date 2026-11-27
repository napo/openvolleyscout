import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { en } from '@src/i18n/locales/en';
import { it as italian } from '@src/i18n/locales/it';
import { computeOpponentReportMetrics } from './report-metrics';
import { computeAttackingReportMetrics } from './attacking-metrics';
import { DEFAULT_THRESHOLDS } from './traffic-light';
import { buildReportView, type ViewT } from './report-view';
import { automaticPriority, priorityText, reportPriorities, reorderPriorities, setReportPriorities } from './report-priorities';
import { bookletImposition, buildReportBooklet, fitBookletCourt, imposeBooklet, wrapBookletText } from './report-booklet';
import { buildReceptionFormationSvg } from './reception-formation';
import { buildSetterRotationCourtSvg } from './report-view';
import { moveReportComponent, reportComponentOrder } from './report-components';
import { assignLineupCell, attackerBoardViews, resolveLineupCells, selectedAttackers, setSelectedAttackers } from './board-pieces';
import { recoverArchivedSetterSheets } from './report-draft';
import type { KeySuggestion } from './report-keys';
const translator = (messages: Record<string,string>): ViewT => (key, params) => (messages[key] ?? key).replace(/{{(\w+)}}/g, (_, name) => String(params?.[name] ?? name));
const t = translator(en);
const suggestion: KeySuggestion = { id:'receiverSideOut:p:1',kind:'receiverSideOut',params:{player:'#7',rotation:'P1',rate:'40%',baseline:'60%',n:40,otherN:60},sample:40,score:1 };
function fixture() {
  const report = createOpponentReport({ id:'test',title:'Prep',opponent:{name:'Rivals'} });
  report.booklet = { ...report.booklet!, includeServe: false };
  const view = buildReportView(report, computeOpponentReportMetrics([]), [], DEFAULT_THRESHOLDS, t, DEFAULT_RECEPTION_SYSTEM_BLOCK, computeAttackingReportMetrics([]));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="270" viewBox="0 0 240 270"><rect width="210" height="210"/><text x="10" y="20">native-marker</text></svg>';
  const player = (key: string) => ({key,jersey:key,name:`Player ${key}`});
  const table = {columns:[],rows:[]};
  view.attackers = Array.from({length:6},(_,i)=>({player:player(String(i+1)),courtSvg:svg,courtSample:'40 attacks',highlights:table,performance:table,distribution:table,notes:''}));
  view.serve.servers = view.attackers.map(a=>({player:a.player,courtSvg:svg,courtSample:'40 serves',highlights:table,hasDirections:true,textSummary:`${a.player.name} · Jump float 80%`}));
  view.setter.groups = [{player:player('2'),attempts:200,bands:(['positive','negative'] as const).map(key=>({key,title:key,players:[],summary:'Z4: 50% (20/40)',courts:Array.from({length:6},(_,i)=>({rotation:i+1,svg,sample:'20 sets',predictability:{text:'50%'}}))}))}];
  return {report,view,svg,player};
}
describe('booklet planning and printing',()=>{
  it('keeps the courts turned on the board, in A5 and in A4',()=>{
    const {report,view}=fixture();
    report.pieceEdits={'attacker:1':{courtRotations:{main:90}},'setter:2:positive':{courtRotations:{P1:180,P2:180,P3:180,P4:180,P5:180,P6:180}}};
    for(const a4 of [false,true]){
      const pages=buildReportBooklet(report,view,t,'',{a4}).pages.join('');
      expect(pages,`a4=${a4} attacker`).toContain('rotate(90)');
      expect(pages,`a4=${a4} setter`).toContain('rotate(180)');
    }
  });
  it('adds a video page with one QR code per chart that has synced video, and none without',()=>{
    const {report,view}=fixture();
    expect(buildReportBooklet(report,view,t).pages.some(page=>page.includes(t('bookletVideoTitle')+'<'))).toBe(false);
    const link=(skill:'attack'|'set')=>({url:'https://example.org/ovs/#/player/abc',expiresAt:new Date(2026,10,20).getTime(),clips:3,actions:3,totalActions:4,skill});
    view.attackers[0]={...view.attackers[0],videoLink:link('attack')};
    view.setter.groups[0].bands[0]={...view.setter.groups[0].bands[0],videoLink:link('set')};
    const pages=buildReportBooklet(report,view,t).pages;
    const videoPage=pages.find(page=>page.includes(`>${t('bookletVideoTitle')}<`))!;
    expect(videoPage).toBeDefined();
    expect(videoPage).toContain(t('tacticalWatchAttack'));
    expect(videoPage).toContain(t('tacticalWatchSet'));
    expect(videoPage.match(/shape-rendering="crispEdges"/g)).toHaveLength(2);
  });
  it('keeps the video grid aligned when a link is too long for a QR code',()=>{
    const {report,view}=fixture();
    const link=(url:string)=>({url,expiresAt:new Date(2026,10,20).getTime(),clips:3,actions:3,totalActions:4,skill:'attack' as const});
    const tooLong=`https://example.org/ovs/#/player/${'x'.repeat(3100)}`;
    // A4 has four columns: the too-long link sits in the last column of the first row.
    view.attackers=view.attackers.slice(0,6);
    view.attackers.forEach((a,i)=>{a.videoLink=link(i===3?tooLong:`https://example.org/ovs/#/player/${i}`);});
    const pages=buildReportBooklet(report,view,t,'',{a4:true}).pages;
    const videoPage=pages.find(page=>page.includes(`>${t('bookletVideoTitle')}<`))!;
    expect(videoPage.match(/shape-rendering="crispEdges"/g)).toHaveLength(5);
    // The cell of the link without a code says so, and the next row starts below the first one.
    expect(videoPage).toContain(t('opponentReportVideoQrUnavailable').slice(0,20));
    const spots=[...videoPage.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\([\d.]+\)"><svg[^>]*shape-rendering="crispEdges"/g)].map(m=>`${m[1]},${m[2]}`);
    expect(spots).toHaveLength(5);
    expect(new Set(spots).size).toBe(5); // No code drawn on top of another one.
  });
  it('keeps both bands and all original courts, and ranks setters by actual usage',()=>{
    const {report,view,player}=fixture();
    const secondary={...view.setter.groups[0],player:player('5'),attempts:20};
    view.setter.groups.unshift(secondary);
    report.booklet={...report.booklet!,format:'compact',base:'compact'};
    const compact=buildReportBooklet(report,view,t);
    expect(compact.pages).toHaveLength(4);
    const setterPage=compact.pages.find(page=>page.includes(t('opponentReportSheet_setter')))!;
    expect(setterPage).toContain('Player 2');
    expect(setterPage).toContain('Player 5');
    expect(compact.pages.join('').match(/native-marker/g)).toHaveLength(18); // 6 attackers + 12 setter diagrams.
    report.booklet.format='extended';
    const extended=buildReportBooklet(report,view,t);
    expect(extended.pages).toHaveLength(8);
    expect(extended.pages.join('')).toContain('Free software');
    expect(extended.pages.every(p=>p.includes('AGPL-3.0-or-later'))).toBe(true);
  });
  it('exposes collected staff notes and applies persistent coach edits without preview URLs',()=>{
    const {report,view,player}=fixture();
    const secondary=structuredClone(view.setter.groups[0]);secondary.player=player('5');secondary.attempts=20;
    view.setter.groups.push(secondary);
    report.boardPieceIds=['attacker:1','setter:2:positive','setter:2:negative'];
    report.pieceEdits={'attacker:1':{note:'Cover the short diagonal',subtitle:'Watch the block-out'}};
    view.attackers[0].videoLink={url:'https://example.com/preview#private-data',expiresAt:123,clips:5};
    const plan=buildReportBooklet(report,view,t,'',{a4:true});
    expect(plan.staffNotes).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'attacker:1:note',body:'Cover the short diagonal'}),
      expect.objectContaining({id:'setter-summary',body:expect.stringContaining('Player 5')}),
    ]));
    expect(plan.pages.join('')).not.toContain('https://example.com/preview');
    expect(JSON.stringify(plan.staffNotes)).not.toContain('private-data');
    report.staffNoteEdits={'attacker:1:note':'Edited by staff','setter-summary':'Keep secondary setter under observation'};
    for(const a4 of [false,true]){
      const edited=buildReportBooklet(report,view,t,'',{a4});
      expect(edited.pages.join('')).toContain('Edited by staff');
      expect(edited.pages.join('')).toContain('Keep secondary setter under observation');
      expect(edited.pages.join('')).not.toContain('Cover the short diagonal');
    }
    report.staffNoteEdits['attacker:1:note']='';
    const excluded=buildReportBooklet(report,view,t,'',{a4:true});
    expect(excluded.staffNotes).toContainEqual(expect.objectContaining({id:'attacker:1:note',body:''}));
    expect(excluded.pages.join('')).not.toContain('Cover the short diagonal');
    delete report.staffNoteEdits['attacker:1:note'];
    expect(buildReportBooklet(report,view,t).pages.join('')).toContain('Cover the short diagonal');
  });
  it('prints a short attacker note in a box beside her court and not again in the staff notes',()=>{
    const {report,view}=fixture();
    report.pieceEdits={'attacker:1':{note:'Cover diagonal'}};
    for(const a4 of [false,true]){
      const plan=buildReportBooklet(report,view,t,'',{a4});
      const attackPage=plan.pages.find(page=>page.includes('data-court-note="attacker:1:note"'));
      expect(attackPage,`a4=${a4}`).toContain('>Cover diagonal<');
      expect(plan.pages.join('').match(/Cover diagonal/g),`a4=${a4}`).toHaveLength(1);
      expect(plan.staffNotes).toContainEqual(expect.objectContaining({id:'attacker:1:note'}));
    }
    expect(buildReportBooklet(report,view,t).pages.some(page=>page.includes('data-court-note="attacker:2:note"'))).toBe(false);
  });
  it('starts a long attacker note in the box and prints it whole in the staff notes',()=>{
    const {report,view}=fixture();
    report.pieceEdits={'attacker:1':{note:`${'Block the line and dig the cross behind it. '.repeat(20)}END-MARKER`}};
    for(const a4 of [false,true]){
      const pages=buildReportBooklet(report,view,t,'',{a4}).pages;
      const attackPage=pages.find(page=>page.includes('data-court-note="attacker:1:note"'))!;
      expect(attackPage,`a4=${a4}`).toContain('…');
      expect(attackPage,`a4=${a4}`).not.toContain('END-MARKER');
      expect(pages.some(page=>page!==attackPage&&page.includes('END-MARKER')),`a4=${a4}`).toBe(true);
    }
  });
  it('charts the setter with most touches by default and the setters the coach ticks, in touch order',()=>{
    const {report,view,player}=fixture();
    // Player 5 set less but touched more balls overall: she is the main setter.
    view.setter.groups[0].touches=210;
    view.setter.groups.push({...structuredClone(view.setter.groups[0]),player:player('5'),attempts:150,touches:320});
    const setterPages=(plan:ReturnType<typeof buildReportBooklet>)=>plan.pages.filter(page=>page.includes(`>${t('opponentReportSheet_setter')} · `));
    const titleOf=(page:string)=>page.match(new RegExp(`>${t('opponentReportSheet_setter')} · ([^<]+)<`))![1];
    const byDefault=buildReportBooklet(report,view,t);
    expect(setterPages(byDefault).map(titleOf)).toEqual(['#5 Player 5']);
    expect(byDefault.staffNotes).toContainEqual(expect.objectContaining({id:'setter-summary',body:expect.stringContaining('Player 2')}));
    report.booklet={...report.booklet!,setterChartKeys:['2','5']};
    const both=buildReportBooklet(report,view,t);
    expect([...new Set(setterPages(both).map(titleOf))]).toEqual(['#5 Player 5','#2 Player 2']);
    expect(both.staffNotes?.some(note=>note.id==='setter-summary')).toBe(false);
    report.booklet={...report.booklet!,setterChartKeys:[]};
    expect(setterPages(buildReportBooklet(report,view,t))).toHaveLength(0);
    report.booklet={...report.booklet!,setterChartKeys:undefined,includeSecondSetter:true};
    expect([...new Set(setterPages(buildReportBooklet(report,view,t)).map(titleOf))]).toEqual(['#5 Player 5','#2 Player 2']);
  });
  it('opens new reports with the Team page: roster and the sets started in each rotation',()=>{
    const {report,view}=fixture();
    const cell=(text:string)=>({text});
    view.team={
      roster:{columns:['#','Name','Role','Matches played'],rows:[['7','Anna Rossi','Setter','3'],['12','Bea Neri','Libero','2']].map(row=>row.map(cell))},
      starts:{columns:['Rotation','Starting on serve','Starting on reception'],rows:[1,2,3,4,5,6].map(r=>[cell(`P${r}`),cell(String(r===1?3:0)),cell(String(r===4?2:0))])},
      hasStarts:true,
      basis:t('teamStartsBasis',{n:5}),
      singleMatch:false,
    };
    for(const a4 of [false,true]){
      const pages=buildReportBooklet(report,view,t,'',{a4}).pages;
      const teamPage=pages[0];
      expect(teamPage,`a4=${a4}`).toContain(`>${t('teamPageTitle',{team:'Rivals'})}<`);
      expect(teamPage).toContain('>Anna Rossi<');
      expect(teamPage).toContain('>Libero<');
      expect(teamPage).toContain('>Team - Rivals<');
      expect(teamPage).toContain('>Name<');
      expect(teamPage).toContain('text-anchor="end">Matches played<');
      expect(teamPage).toContain('text-anchor="end">3<');
      expect(teamPage).toContain('>Starting on serve<');
      // Grey bars, the highest of each chart in the accent colour.
      expect(teamPage.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#007e80"/g)).toHaveLength(2);
      expect(teamPage.indexOf('>P1<')).toBeLessThan(teamPage.indexOf('>P6<'));
      expect(pages.filter(page=>page.includes('>Anna Rossi<')),`a4=${a4} roster printed once`).toHaveLength(1);
    }
    // The rotations follow the setter's game order, with the letter of each language.
    const metrics=computeOpponentReportMetrics([]);
    metrics.startingRotationCounts[4]={serve:1,receive:0};
    const order=(translate:ViewT)=>buildReportView(report,metrics,[],DEFAULT_THRESHOLDS,translate,DEFAULT_RECEPTION_SYSTEM_BLOCK,computeAttackingReportMetrics([])).team!.starts.rows.map(row=>row[0].text);
    expect(order(t)).toEqual(['Z1','Z6','Z5','Z4','Z3','Z2']);
    expect(order(translator(italian))).toEqual(['P1','P6','P5','P4','P3','P2']);
    // A tie between the highest bars: the rotation used most in the latest matches is the coloured one, with a note.
    view.team={...view.team!,
      starts:{...view.team!.starts,rows:['P1','P6','P5','P4','P3','P2'].map((label,i)=>[cell(label),cell(String(i===0||i===3?4:1)),cell('0')])},
      recent:{matches:3,serve:[1,0,0,2,0,0],receive:[0,0,0,0,0,0]}};
    const tiePage=buildReportBooklet(report,view,t).pages[0];
    expect(tiePage).toContain(`>${t('teamStartsTieNote',{rotation:'P4',n:3})}<`);
    expect(tiePage.match(/fill="#007e80" rx="1.5"/g)).toHaveLength(1);
    // Still level in the latest matches: both stay coloured and no note is written.
    view.team={...view.team!,recent:{matches:3,serve:[1,0,0,1,0,0],receive:[0,0,0,0,0,0]}};
    const levelPage=buildReportBooklet(report,view,t).pages[0];
    expect(levelPage.match(/fill="#007e80" rx="1.5"/g)).toHaveLength(2);
    expect(levelPage).not.toContain('used most');
    // What the chart is counted on is always written under it; the coach's colours replace the default ones.
    expect(levelPage).toContain(`>${t('teamStartsBasis',{n:5})}<`);
    report.pieceEdits={'team:starts':{chartColors:{bar:'#aaaaaa',highlight:'#ff0000'}}};
    const coloured=buildReportBooklet(report,view,t).pages[0];
    expect(coloured).toContain('fill="#ff0000" rx="1.5"');
    expect(coloured).toContain('fill="#aaaaaa" rx="1.5"');
    report.pieceEdits={};
    // One match only: the rotation is written instead of the chart, with the match it comes from.
    view.team={...view.team!,singleMatch:true,basis:t('teamStartsSingleMatch',{team:'Gela',date:'01/11/2026'}),
      starts:{...view.team!.starts,rows:['P1','P6','P5','P4','P3','P2'].map((label,i)=>[cell(label),cell(i===0?'3':'0'),cell(i===3?'2':i===5?'1':'0')])}};
    const single=buildReportBooklet(report,view,t).pages[0];
    expect(single).not.toContain('rx="1.5"');
    expect(single).toContain('>P1<');
    expect(single).toContain('>P4 (2) · P2 (1)<');
    expect(single).toContain('>In the match against Gela on 01/11/2026.<');
    // Reports saved before the Team sheet keep their pages until the coach turns it on.
    report.booklet={...report.booklet!,includeTeam:undefined};
    expect(buildReportBooklet(report,view,t).pages.some(page=>page.includes(`>${t('teamPageTitle',{team:'Rivals'})}<`))).toBe(false);
  });
  it('moves an athlete to the cell where the coach puts her, at most two per cell',()=>{
    const cells=[['a'],['b'],['c'],['d'],['e'],['f'],['l'],[]];
    expect(assignLineupCell(cells,0,['a','g'])).toEqual([['a','g'],['b'],['c'],['d'],['e'],['f'],['l'],[]]);
    expect(assignLineupCell(cells,1,['b','c'])).toEqual([['a'],['b','c'],[],['d'],['e'],['f'],['l'],[]]);
    expect(assignLineupCell(cells,7,['l'])[6]).toEqual([]);
    const known=new Map([['a',1],['b',1],['c',1]]);
    expect(resolveLineupCells([['a','b','c'],['a'],['x']],known)).toEqual([['a','b'],[],[],[],[],[],[],[]]);
  });
  it('prints the line-up by zone with two athletes side by side and the starters of the cells',()=>{
    const {report,view}=fixture();
    const cell=(text:string)=>({text});
    const info=(key:string,name:string,role:string,matches:number)=>({key,jersey:key,name,role,figures:'Att. 30%',matches,stats:[cell(key),cell(name),...Array.from({length:7},()=>cell('1'))]});
    const players=[info('1','Ada Setter','P',4),info('2','Bea Out','S',4),info('3','Cia Mid','C',3),info('4','Dea Opp','O',4),info('5','Eva Out','S',2),info('6','Fra Mid','C',4),info('7','Gio Out','S',2),info('8','Ila Lib','L',4)];
    view.team={roster:{columns:[],rows:[]},starts:{columns:[],rows:[]},hasStarts:false,basis:'',singleMatch:false,players,
      lineupCells:[['1'],['2'],['3'],['4'],['5'],['6'],['8'],[]],liberoLabels:['L','L'],lineupCaption:'Six that started most sets together: 5 of 9 sets.',startersColumns:['#','Name','Serve','Serve eff.','Rec.','Rec. pos.','Att.','Att. eff.','Block']};
    report.pieceEdits={'team:lineup':{lineupCells:[['1'],['2'],['3'],['4'],['5','7'],['6'],['8'],[]]}};
    const page=buildReportBooklet(report,view,t).pages.find(p=>p.includes(`>${t('teamLineupTitle')}<`))!;
    expect(page).toBeDefined();
    expect(page).toContain('>#5 Eva Out<');
    expect(page).toContain('>#7 Gio Out<');
    expect(page).toContain(`>${t('teamCellMatches',{n:2})}<`);
    // The starters' table follows the cells: Gio, put in by the coach, is listed after its title.
    expect(page.indexOf('>Gio Out<')).toBeGreaterThan(page.indexOf(`>${t('teamStartersTitle')}<`));
    // Only one libero cell is drawn when the second is empty.
    expect(page.match(/rx="4" fill="#f8fafc" stroke="#cbd5e1" stroke-width=".8"/g)).toHaveLength(7);
  });
  it('chooses the athletes of Block and defence for one view, or for all views at once',()=>{
    const {report,view}=fixture();
    view.attackers.forEach((attacker,i)=>{attacker.attempts=60-i;});
    // Default view: the choice prints only the chosen athletes.
    const one=setSelectedAttackers(report,view,[undefined],['1','3']);
    expect([...selectedAttackers(one,view)]).toEqual(['1','3']);
    expect(buildReportBooklet(one,view,t).pages.join('')).not.toContain('>#2 Player 2<');
    // Custom views: one view changes alone; "apply to all" replaces every view's choice.
    view.attackerViews=['rec','dig'].map(id=>({id,label:id,attackers:view.attackers.map(a=>({...a,player:a.player,attempts:a.attempts??0,hasDirections:true}))}));
    expect(attackerBoardViews(view).map(entry=>entry.id)).toEqual(['rec','dig']);
    const everyone=setSelectedAttackers(report,view,['rec','dig'],['1','2','3','4','5','6']);
    const perView=setSelectedAttackers(everyone,view,['rec'],['2']);
    expect([...selectedAttackers(perView,view,'rec')]).toEqual(['2']);
    expect(selectedAttackers(perView,view,'dig').size).toBe(6);
    const all=setSelectedAttackers(perView,view,['rec','dig'],['4','5']);
    expect([...selectedAttackers(all,view,'rec')]).toEqual(['4','5']);
    expect([...selectedAttackers(all,view,'dig')]).toEqual(['4','5']);
  });
  it('prints "back to the same attacker" for the charted setter: lines in the booklet, a table in A4',()=>{
    const {report,view}=fixture();
    const cell=(text:string)=>({text});
    view.setter.groups[0].repeat={columns:['Attacker','After error','After block','Usually','In the rally'],rows:[['#4 Player 4','40% (2/5)','-','30% (12/40)','50% (3/6)'].map(cell)]};
    const booklet=buildReportBooklet(report,view,t);
    expect(booklet.staffNotes?.find(note=>note.id==='setter-repeat:2:lines')?.body).toContain('#4 Player 4: After error 40% (2/5) · After block - · Usually 30% (12/40) · In the rally 50% (3/6)');
    const a4=buildReportBooklet(report,view,t,'',{a4:true}).pages.join('');
    expect(a4).toContain(`>${t('setterRepeatTitle')} · #2 Player 2<`);
    expect(a4).toContain('>40% (2/5)<');
  });
  it('shares the component order between the navigator and every export layout',()=>{
    const {report,view}=fixture();
    report.notes='Staff note moved to the beginning';
    const reordered=moveReportComponent(moveReportComponent(report,'attackers','keys'),'notes','attackers');
    expect(reportComponentOrder(reordered).slice(0,4)).toEqual(['team','notes','attackers','keys']);
    expect(moveReportComponent(reordered,'notes','notes')).toBe(reordered);
    expect(reportComponentOrder({...report,componentOrder:['setter','setter']})).toHaveLength(11);
    // A report saved before the Team sheet gets it where it belongs, not after the notes.
    expect(reportComponentOrder({...report,componentOrder:['keys','serveTargets','attackers','setter','zones','serve','overview','reception','board','notes']})[0]).toBe('team');
    for(const a4 of [false,true]){
      const plan=buildReportBooklet(reordered,view,t,'',{a4});
      expect(plan.pages[0]).toContain('Staff note moved to the beginning');
      const attackIndex=plan.pages.findIndex(page=>page.includes('native-marker'));
      const priorityIndex=plan.pages.findIndex(page=>page.includes(t('opponentReportSheet_keys')));
      expect(attackIndex).toBeGreaterThan(0);expect(attackIndex).toBeLessThan(priorityIndex);
    }
  });
  it('keeps all six serving-target descriptions below their courts in P4 P3 P2 / P5 P6 P1 order',()=>{
    const {report,view}=fixture();
    report.pieceEdits={'reception:serve-targets':{courtSamples:Object.fromEntries([1,2,3,4,5,6].map(rotation=>[`P${rotation}`,`Reception target description for rotation ${rotation}: serve towards the observed receiver and cover the next first attack carefully.`]))}};
    for(const a4 of [false,true]){
      const plan=buildReportBooklet(report,view,t,'',{a4});
      const page=plan.pages.find(page=>page.includes('Reception target description'))!;
      expect(plan.pages.filter(page=>page.includes('Reception target description'))).toHaveLength(1);
      expect([...page.matchAll(/Reception target description/g)]).toHaveLength(6);
      expect([...page.matchAll(/rotation ([1-6]):/g)].map(match=>Number(match[1]))).toEqual([4,3,2,5,6,1]);
      const positions=[...page.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\([^)]+\)"><svg/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
      expect(positions).toHaveLength(7);
      expect(positions[0].y).toBe(positions[1].y);expect(positions[1].y).toBe(positions[2].y);
      expect(positions[3].y).toBeGreaterThan(positions[0].y);
      expect(positions[6].y).toBeGreaterThan(positions[3].y);
    }
  });
  it('keeps secondary setters descriptive in rich A4 even when their board pieces are selected',()=>{
    const {report,view,player}=fixture();
    const secondary=structuredClone(view.setter.groups[0]);secondary.player=player('5');secondary.attempts=20;
    secondary.bands.forEach(b=>b.courts.forEach(c=>c.svg=c.svg.replace('native-marker','secondary-marker')));
    view.setter.groups.push(secondary);
    report.boardPieceIds=['keys:main','setter:5:positive','setter:5:negative'];
    report.pieceEdits={'setter:5:positive':{note:'Secondary coach note'}};
    report.booklet={...report.booklet!,format:'custom',includeBoardExtras:true,includeSecondSetter:false};
    const text=buildReportBooklet(report,view,t,'',{a4:true}).pages.join('');
    expect(text).not.toContain('secondary-marker');
    expect(text).toContain('Player 5');expect(text).toContain('Z4: 50% (20/40)');expect(text).toContain('Secondary coach note');
    // Enabling drawings works in the standard format, too, and all 12 stay together.
    report.booklet={...report.booklet,format:'extended',includeSecondSetter:true};
    const pages=buildReportBooklet(report,view,t,'',{a4:true}).pages;
    const drawn=pages.filter(page=>page.includes('secondary-marker'));
    expect(drawn).toHaveLength(1);expect(drawn[0].match(/secondary-marker/g)).toHaveLength(12);
  });
  it('packs six attack drawings in two columns with descriptions below and retains chosen players as descriptions without reintroducing their charts',()=>{
    const {report,view}=fixture();
    view.attackers.forEach(a=>a.courtSvg=a.courtSvg.replace('native-marker',`attack-native-${a.player.key}`));
    view.attackers[5].distribution={columns:['Direction','Share'],rows:[[{text:'Cross-court'},{text:'70%'}]]};
    report.boardPieceIds=view.attackers.map(a=>`attacker:${a.player.key}`);
    report.booklet={...report.booklet!,format:'custom',includeBoardExtras:true,textOnlyAttackerKeys:['6']};
    for(const a4 of [true,false]){
      const plan=buildReportBooklet(report,view,t,'',{a4});
      const attackPages=plan.pages.filter(p=>p.includes('attack-native-'));
      expect(attackPages).toHaveLength(1);
      expect(attackPages.every(p=>(p.match(/attack-native-/g)??[]).length<=6)).toBe(true);
      const positions=[...attackPages[0].matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\([^)]+\)"><svg/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
      expect(positions).toHaveLength(6);
      expect(positions[0].x).toBeLessThan(positions[1].x);
      expect(positions[0].y).toBe(positions[1].y);expect(positions[2].y).toBe(positions[3].y);
      expect(positions[2].y).toBeGreaterThan(positions[0].y);expect(positions[4].y).toBeGreaterThan(positions[2].y);
      expect(positions[5].y).toBeGreaterThan(positions[4].y);
      expect(plan.pages.join('')).not.toContain('attack-native-6');
      expect(plan.pages.join('')).toContain('Cross-court');expect(plan.pages.join('')).toContain('70%');
    }
  });
  it('places side-out courts in four rows of three, grouped by reception and in court order',()=>{
    const {report,view}=fixture();
    for(const band of view.setter.groups[0].bands) for(const court of band.courts) court.svg=court.svg.replace('native-marker', `order-${band.key}-P${court.rotation}`);
    // Input order must not determine the visual arrangement.
    view.setter.groups[0].bands.reverse();
    const expected=['positive','negative'].flatMap(band=>[4,3,2,5,6,1].map(rotation=>`${band}-P${rotation}`));
    for(const format of ['compact','extended','a4'] as const){
      report.booklet={...report.booklet!,format:format==='compact'?'compact':'extended'};
      const plan=buildReportBooklet(report,view,t,'',{a4:format==='a4'});
      const page=plan.pages.find(page=>page.includes('order-positive-P4'))!;
      expect([...page.matchAll(/order-(positive|negative)-P([1-6])/g)].map(match=>`${match[1]}-P${match[2]}`)).toEqual(expected);
      const positions=[...page.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\([^)]+\)"><svg[^]*?order-(positive|negative)-P([1-6])/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
      expect(positions).toHaveLength(12);
      for(let row=0;row<4;row++){
        const [left,middle,right]=positions.slice(row*3,row*3+3);
        expect(left.x).toBeLessThan(middle.x);expect(middle.x).toBeLessThan(right.x);
        expect(left.y).toBe(middle.y);expect(middle.y).toBe(right.y);
        if(row)expect(left.y).toBeGreaterThan(positions[(row-1)*3].y);
      }
      expect(page).toContain(t('opponentReportSetterPositiveBand'));
      expect(page).toContain(t('opponentReportSetterNegativeBand'));
    }
  });
  it('restores missing setter sheets once for archived imports without replacing coach edits',()=>{
    const {report,view}=fixture();
    report.draftStatus='editing'; report.boardPieceIds=['keys:main'];
    report.pieceEdits={'keys:main':{items:['Coach instruction']}};
    const recovered=recoverArchivedSetterSheets(report,view,true);
    expect(recovered.boardPieceIds).toEqual(['keys:main','setter:2:positive','setter:2:negative']);
    expect(recovered.pieceEdits).toBe(report.pieceEdits);
    const deliberatelyHidden={...recovered,boardPieceIds:['keys:main']};
    expect(recoverArchivedSetterSheets(deliberatelyHidden,view,true)).toBe(deliberatelyHidden);
    expect(recoverArchivedSetterSheets(report,view,false)).toBe(report);
  });
  it('builds full A4 pages with the extended diagrams and rich player statistics',()=>{
    const {report,view}=fixture();
    view.attackers[0].highlights={columns:['Metric','Value'],rows:[[{text:'Kills'},{text:'67% (20/30)'}]]};
    report.booklet={...report.booklet!,format:'compact',base:'compact'};
    const plan=buildReportBooklet(report,view,t,'4 matches',{a4:true,matchLines:['Rivals vs Team - 3:1']});
    expect(plan.width).toBe(595.276);
    expect(plan.height).toBe(841.89);
    expect(plan.paddingPages).toBe(0);
    expect(plan.pages.every(page=>page.includes('viewBox="0 0 595.276 841.89"'))).toBe(true);
    const svg=plan.pages.join('');
    expect(svg.match(/native-marker/g)).toHaveLength(18);
    expect(svg).toContain('Kills');
    expect(svg).toContain('67% (20/30)');
    expect(svg).toContain('Rivals vs Team - 3:1');
    expect(svg).not.toContain('opponentReportMatches');
  });
  it('prints only the first five with the first three highlighted, preserving positions of excluded secondaries',()=>{
    const {report,view}=fixture();
    view.keys=Array.from({length:10},(_,index)=>({text:`Advice-${index+1}-END`,source:'confirmed',includeInPrint:index!==3}));
    const plan=buildReportBooklet(report,view,t);
    const svg=plan.pages.join('');
    expect(svg).toContain('Advice-1-END');expect(svg).toContain('Advice-5-END');
    expect(svg).not.toContain('Advice-4-END');expect(svg).not.toContain('Advice-6-END');
    expect(plan.pages[0].match(/fill="#eaf3f3"/g)).toHaveLength(3);
  });
  it('paginates long manual content and extra serves without clipping or silently dropping the tail',()=>{
    const {report,view}=fixture();
    report.booklet={...report.booklet!,format:'custom',includeServe:true};
    report.notes='Long note '.repeat(1800)+'END-OF-NOTE';
    const plan=buildReportBooklet(report,view,t);
    expect(plan.pages.length).toBeGreaterThan(8);expect(plan.pages.length%4).toBe(0);
    expect(plan.pages.join('')).toContain('END-OF-NOTE');expect(plan.pages.join('')).toContain('40 serves');
    expect(imposeBooklet(plan)).toHaveLength(plan.pages.length/2);
    expect(plan.sheets).toBe(plan.pages.length/4);
  });
  it('packs short coach annotations together instead of adding one page per player',()=>{
    const {report,view}=fixture();
    view.attackers.forEach((attacker,index)=>{ attacker.notes=`Coach note ${index+1}`; });
    const plan=buildReportBooklet(report,view,t);
    expect(plan.pages).toHaveLength(8);
    for(let i=1;i<=6;i++) expect(plan.pages.join('')).toContain(`Coach note ${i}`);
  });
  it('uses the right nesting order on 4, 8 and 12 page booklets',()=>{
    expect(bookletImposition(4)).toEqual([[3,0],[1,2]]);
    expect(bookletImposition(8)).toEqual([[7,0],[1,6],[5,2],[3,4]]);
    for(const n of [4,8,12]) expect(bookletImposition(n).flat().sort((a,b)=>a-b)).toEqual(Array.from({length:n},(_,i)=>i));
    expect(()=>bookletImposition(6)).toThrow();
  });
  it('uniformly scales genuine reception and setter SVGs without rewriting their geometry',()=>{
    const svg=buildReceptionFormationSvg({rotation:1,receptions:0,receptionPositive:null,dots:[]},{title:'P1',net:'Net'});
    const fitted=fitBookletCourt(svg,20,80,130,150,'court');
    expect(fitted).toContain('width="210" height="210"');
    expect(fitted).toMatch(/scale\([\d.]+\)/);
    expect(fitted).not.toMatch(/scale\([^)]*[, ]/);
    const band={attempts:0,matches:0,zones:[]};
    expect(fitBookletCourt(buildSetterRotationCourtSvg(1,band,band,null,t),0,0,80,100,'setter')).toContain('width="212" height="212"');
    const {report,view}=fixture();report.pieceEdits={'attacker:1':{title:'COACH TITLE',subtitle:'COACH SUBTITLE',note:'COACH NOTE',courtDrawings:{main:{id:'draw',title:'',note:'',court:'half',orientation:'vertical',shapes:[{id:'t',kind:'text',text:'COACH DRAWING',x:30,y:30}]}}}};
    report.pieceEdits['setter:2:positive']={courtBadges:{P1:'COACH BADGE'}};
    const plan=buildReportBooklet(report,view,t);
    expect(plan.pages.join('')).toContain('COACH SUBTITLE');expect(plan.pages.join('')).toContain('COACH BADGE');
    expect(plan.pages.join('')).toContain('COACH TITLE');expect(plan.pages.join('')).toContain('COACH NOTE');expect(plan.pages.join('')).toContain('COACH DRAWING');
    expect(wrapBookletText('長い名前'.repeat(40),100,8).length).toBeGreaterThan(1);
  });
  it('renders custom setter distribution views without crashing on unknown band keys',()=>{
    const {report,view}=fixture();
    const customBand={...view.setter.groups[0].bands[0],key:'view-custom-3',title:'Zona 5 jump float'};
    view.setter.groups[0].bands=[...view.setter.groups[0].bands,customBand];
    report.setterViews=[
      {id:'positive',label:'Positive',receptionBand:'positive'},
      {id:'negative',label:'Negative',receptionBand:'negative'},
      {id:'view-custom-3',label:'Zona 5 jump float',receptionBand:'all',receptionZones:['5']},
    ];
    const plan=buildReportBooklet(report,view,t);
    expect(plan.pages.join('')).toContain('Zona 5 jump float');
  });
  it('renders multiple custom attacker direction views as separate titled sections',()=>{
    const {report,view}=fixture();
    const base=view.attackers[0];
    view.attackerViews=[
      {id:'v-rec',label:'Dopo ricezione #/+',attackers:[{player:base.player,attempts:12,hasDirections:true,courtSvg:base.courtSvg,courtSample:'12',highlights:base.highlights,notes:''}]},
      {id:'v-tip',label:'Piazzate Z4',attackers:[{player:base.player,attempts:5,hasDirections:true,courtSvg:base.courtSvg,courtSample:'5',highlights:base.highlights,notes:''}]},
    ];
    report.attackerViews=[
      {id:'v-rec',label:'Dopo ricezione #/+',phases:['after_receive'],receptionEvaluations:['#','+']},
      {id:'v-tip',label:'Piazzate Z4',attackZones:['4'],attackSubtypes:['P']},
    ];
    const plan=buildReportBooklet(report,view,t);
    const svg=plan.pages.join('');
    expect(svg).toContain('Dopo ricezione #/+');
    expect(svg).toContain('Piazzate Z4');
  });
  it('omits sections and pieces removed from boardPieceIds in both booklet and A4 exports',()=>{
    const {report,view}=fixture();
    report.boardPieceIds=['keys:main','attacker:1'];
    for(const a4 of [false,true]){
      const svg=buildReportBooklet(report,view,t,'',{a4}).pages.join('');
      expect(svg).toContain(t('opponentReportSheet_keys'));
      expect(svg).toContain('Player 1');
      expect(svg).not.toContain('Player 2');
      expect(svg).not.toContain(t('opponentReportFormations'));
      expect(svg).not.toContain(t('opponentReportSheet_setter'));
    }
  });
});
describe('persistent multilingual priorities',()=>{
  it('regenerates automatic wording after reopening in another language while keeping coach text and order',()=>{
    const {report}=fixture();
    report.keys=[automaticPriority(suggestion),{id:'custom',source:'custom',text:'Consegna dello staff'}];
    const reopened=JSON.parse(JSON.stringify(report));
    const saved=reportPriorities(reopened,[]);
    expect(priorityText(saved[0],t)).toContain('consider serving');
    expect(priorityText(saved[0],translator(italian))).toContain('ricezione di #7');
    expect(priorityText(saved[1],t)).toBe('Consegna dello staff');
    expect(reorderPriorities(saved,1,0).map(k=>k.id)).toEqual(['custom',suggestion.id]);
  });
  it('preserves frozen legacy edits, supports an intentionally empty list and clears only migrated list overrides',()=>{
    const {report}=fixture();
    report.pieceEdits={'keys:main':{title:'Coach title',items:['Legacy manual']}};
    const keys=reportPriorities(report,[suggestion]);expect(keys[0].text).toBe('Legacy manual');
    const migrated=setReportPriorities(report,keys);
    expect(migrated.pieceEdits?.['keys:main']).toEqual({title:'Coach title'});
    migrated.keys=[];expect(reportPriorities(migrated,[suggestion])).toEqual([]);
  });
  it('prints the six main servers on one "how they serve" page and lists the others as text',()=>{
    const {report,view,svg,player}=fixture();
    report.booklet={...report.booklet!,includeServe:true};
    view.serve.servers=Array.from({length:8},(_,i)=>({player:player(`s${i}`),courtSvg:svg,courtSample:'serves',highlights:{columns:[],rows:[]},hasDirections:true,textSummary:`Server ${i} · Jump float 80%`}));
    const plan=buildReportBooklet(report,view,t);
    const servePages=plan.pages.filter(page=>page.includes('How they serve'));
    expect(servePages).toHaveLength(1);
    expect(plan.staffNotes?.find(note=>note.id==='serve-reserves')?.body).toBe('Server 6 · Jump float 80%\nServer 7 · Jump float 80%');
    report.booklet={...report.booklet!,includeServeReserves:true};
    expect(buildReportBooklet(report,view,t).pages.filter(page=>page.includes('How they serve'))).toHaveLength(2);
  });
  it('prints the servers the coach chooses, six per page, and lists the others as text',()=>{
    const {report,view,svg,player}=fixture();
    report.booklet={...report.booklet!,includeServe:true};
    view.serve.servers=Array.from({length:8},(_,i)=>({player:player(`s${i}`),courtSvg:svg,courtSample:'serves',highlights:{columns:[],rows:[]},hasDirections:true,textSummary:`Server ${i} · Jump float 80%`,serves:80-i}));
    const servePages=(plan:ReturnType<typeof buildReportBooklet>)=>plan.pages.filter(page=>page.includes('>How they serve<'));
    report.booklet={...report.booklet!,serveChartKeys:['s7','s2']};
    const two=buildReportBooklet(report,view,t);
    expect(servePages(two)).toHaveLength(1);
    expect(servePages(two)[0].match(/native-marker/g)).toHaveLength(2);
    expect(two.staffNotes?.find(note=>note.id==='serve-reserves')?.body).toContain('Server 0');
    expect(two.staffNotes?.find(note=>note.id==='serve-reserves')?.body).not.toContain('Server 7');
    report.booklet={...report.booklet!,serveChartKeys:['s0','s1','s2','s3','s4','s5','s6']};
    expect(servePages(buildReportBooklet(report,view,t))).toHaveLength(2);
  });
  it('leaves out the serve sheet without directions but keeps the known serve facts as text',()=>{
    const {report,view,svg,player}=fixture();
    report.booklet={...report.booklet!,includeServe:true};
    view.serve.servers=[{player:player('s1'),courtSvg:svg,courtSample:'serves',highlights:{columns:[],rows:[]},hasDirections:false,textSummary:'#s1 · Jump float 80% · from zone 1 70%'}];
    const plan=buildReportBooklet(report,view,t);
    expect(plan.pages.some(page=>page.includes('font-size="13" font-weight="bold" fill="#fff" xml:space="preserve">How they serve<'))).toBe(false);
    expect(plan.staffNotes?.find(note=>note.id==='serve-text')?.body).toBe('#s1 · Jump float 80% · from zone 1 70%');
  });
  it('makes the block and defence sheet optional',()=>{
    const {report,view}=fixture();
    expect(buildReportBooklet(report,view,t).pages.some(page=>page.includes('>Block and defence</text>'))).toBe(true);
    report.booklet={...report.booklet!,includeAttackers:false};
    expect(buildReportBooklet(report,view,t).pages.some(page=>page.includes('>Block and defence</text>'))).toBe(false);
    expect(buildReportBooklet(report,view,t,'',{a4:true}).pages.some(page=>page.includes('>Block and defence</text>'))).toBe(false);
  });
  it('prints the reaction after a conceded break under the priorities',()=>{
    const {report,view}=fixture();
    view.overview.breakReaction={columns:['Situation','Value','Sample'],rows:[
      [{text:'Go-to attacker after break'},{text:'#9 Rossi · 60% (6/10)'},{text:'Matches: 2 · actions: 10'}],
      [{text:'Serve after break side-out'},{text:'-'},{text:'Matches: 0 · actions: 0'}],
    ]};
    const first=buildReportBooklet(report,view,t).pages[0];
    expect(first).toContain('Reaction after a conceded break');
    expect(first).toContain('Go-to attacker after break: #9 Rossi');
    expect(first).not.toContain('Serve after break side-out');
    view.overview.breakReaction={columns:[],rows:[]};
    expect(buildReportBooklet(report,view,t).pages[0]).not.toContain('Reaction after a conceded break');
  });
});
