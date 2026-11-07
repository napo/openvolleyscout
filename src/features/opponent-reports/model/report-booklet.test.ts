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
    report.boardPieceIds=['attacker:1'];
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
  it('shares the component order between the navigator and every export layout',()=>{
    const {report,view}=fixture();
    report.notes='Staff note moved to the beginning';
    const reordered=moveReportComponent(moveReportComponent(report,'attackers','keys'),'notes','attackers');
    expect(reportComponentOrder(reordered).slice(0,3)).toEqual(['notes','attackers','keys']);
    expect(moveReportComponent(reordered,'notes','notes')).toBe(reordered);
    expect(reportComponentOrder({...report,componentOrder:['setter','setter']})).toHaveLength(9);
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
      expect(positions).toHaveLength(6);
      expect(positions[0].y).toBe(positions[1].y);expect(positions[1].y).toBe(positions[2].y);
      expect(positions[3].y).toBeGreaterThan(positions[0].y);
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
      expect(positions).toHaveLength(5);
      expect(positions[0].x).toBeLessThan(positions[1].x);
      expect(positions[0].y).toBe(positions[1].y);expect(positions[2].y).toBe(positions[3].y);
      expect(positions[2].y).toBeGreaterThan(positions[0].y);expect(positions[4].y).toBeGreaterThan(positions[2].y);
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
});
describe('persistent multilingual priorities',()=>{
  it('regenerates automatic wording after reopening in another language while keeping coach text and order',()=>{
    const {report}=fixture();
    report.keys=[automaticPriority(suggestion),{id:'custom',source:'custom',text:'Consegna dello staff'}];
    const reopened=JSON.parse(JSON.stringify(report));
    const saved=reportPriorities(reopened,[]);
    expect(priorityText(saved[0],t)).toContain('consider serving');
    expect(priorityText(saved[0],translator(italian))).toContain('valuta la battuta');
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
});
