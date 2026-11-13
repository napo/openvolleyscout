/**
 * Up to ten actionable proposals ranked by observed point contribution,
 * exposure and sample reliability. Pure data: wording is translated at render time.
 */
import type { OpponentReportMetrics, Ratio, ReportPlayer } from './report-metrics';
import type { AttackingReportMetrics } from './attacking-metrics';
import type { ServingReportMetrics } from './serving-metrics';
import type { OpponentReportThresholds } from './traffic-light';

export type KeyKind =
  | 'receiverSideOut'
  | 'attackerEfficiencyDrop'
  | 'setterContext'
  | 'serveTarget'
  | 'serveTargetNoZone'
  | 'weakReceiver'
  | 'weakSideOutRotation'
  | 'strongBreakRotation'
  | 'mainAttacker'
  | 'frontRowReceiver'
  | 'firstBallDrop'
  | 'errorProneServer'
  | 'attackerZone'
  | 'clutchAttacker'
  | 'attackerVsBlock'
  | 'attackerPhaseDrop'
  | 'attackerTip'
  | 'attackerBlockOut'
  | 'setterPredictability'
  | 'serverTargetZone'
  | 'breakReactionAttacker';

export interface KeySuggestion {
  /** Stable across recomputations (kind + subject): remembers dismissals. */
  id: string;
  kind: KeyKind;
  params: Record<string, string | number>;
  score: number;
  sample: number;
}

/** How many suggestions the report proposes by default. */
export const KEY_COUNT = 10;

export const percent = (value: number | null): string => (value === null ? '-' : `${Math.round(value * 100)}%`);
export const playerLabel = (player: ReportPlayer): string => {
  const jerseyTag = player.jersey ? `#${player.jersey}` : '';
  const trimmedName = player.name.trim();
  if (!trimmedName || trimmedName === jerseyTag) return jerseyTag || '?';
  return [jerseyTag, trimmedName].filter(Boolean).join(' ');
};
export const compareReportPlayers = (left: ReportPlayer, right: ReportPlayer): number => {
  if (left.jersey && right.jersey) {
    return left.jersey.localeCompare(right.jersey, undefined, { numeric: true });
  }
  if (left.jersey) return -1;
  if (right.jersey) return 1;
  return left.name.localeCompare(right.name);
};
const rotationLabel = (rotation: number) => `P${rotation}`;

const enough = (value: Ratio, thresholds: OpponentReportThresholds) => value.rate !== null && value.total >= thresholds.minSample;

/** Observed point contribution, exposure and sample reliability; never a causal points forecast. */
export function buildKeySuggestions(
  metrics: OpponentReportMetrics,
  thresholds: OpponentReportThresholds,
  attacking?: AttackingReportMetrics,
  serving?: ServingReportMetrics,
): KeySuggestion[] {
  const min = thresholds.minSample;
  const suggestions: KeySuggestion[] = [];
  const add = (kind: KeyKind, subject: string, params: KeySuggestion['params'], sample: number, exposure: number, effect: number) => {
    if (sample < min || effect <= 0 || exposure <= 0) return;
    suggestions.push({ id: `${kind}:${subject}`, kind, params, sample,
      score: exposure * effect * sample / (sample + Math.max(1, min)) });
  };
  const receptionTotal = (metrics.receiverSideOut ?? []).reduce((sum, row) => sum + row.sideOut.total, 0);
  for (const row of metrics.receiverSideOut ?? []) {
    if (!enough(row.sideOut, thresholds) || !enough(row.others, thresholds)) continue;
    const gap = row.others.rate! - row.sideOut.rate!;
    if (gap < 0.08) continue;
    add('receiverSideOut', `${row.player.key}:${row.rotation}`, {
      player: playerLabel(row.player), rotation: rotationLabel(row.rotation),
      rate: percent(row.sideOut.rate), baseline: percent(row.others.rate),
      n: row.sideOut.total, otherN: row.others.total,
    }, Math.min(row.sideOut.total, row.others.total), row.sideOut.total / Math.max(1, receptionTotal), gap);
  }
  for (const [field,kind] of [['sideOut','weakSideOutRotation'],['breakPoint','strongBreakRotation']] as const) {
    const total = metrics.rotations.reduce((a,r) => a+r[field].total,0);
    const wins = metrics.rotations.reduce((a,r) => a+r[field].count,0);
    for (const row of metrics.rotations) {
      const value=row[field], otherTotal=total-value.total;
      if (!enough(value,thresholds) || otherTotal<min) continue;
      const other=(wins-value.count)/otherTotal;
      const gap=field==='sideOut'?other-value.rate!:value.rate!-other;
      if(gap<0.08) continue;
      add(kind,String(row.rotation),{rotation:rotationLabel(row.rotation),rate:percent(value.rate),team:percent(other),n:value.total,otherN:otherTotal},Math.min(value.total,otherTotal),value.total/Math.max(1,total),gap);
    }
  }
  const totalAttacks=attacking?.attackers.reduce((a,r)=>a+r.all.attacks,0) ?? metrics.attackers.reduce((a,r)=>a+r.attacks,0);
  if (attacking) for(const row of attacking.attackers){
    const all=row.all;
    if(all.attacks<min) continue;
    const share=all.attacks/Math.max(1,totalAttacks);
    const eff=all.efficiency ?? 0;
    if(share>=0.15 && eff>0) add('mainAttacker',row.player.key,{player:playerLabel(row.player),share:percent(share),rate:percent(all.kill.rate),eff:percent(eff),n:all.attacks},all.attacks,share,eff);
    const formed=all.blockers.filter(b=>b.blockers>=2), other=all.blockers.filter(b=>b.blockers<2);
    const aggregate=(rows:typeof formed)=>rows.reduce((a,b)=>({n:a.n+b.attacks,net:a.net+b.kill.count-b.errors.count}),{n:0,net:0});
    const f=aggregate(formed),o=aggregate(other);
    if(f.n>=min&&o.n>=min){
      const gap=o.net/o.n-f.net/f.n;
      if(gap>=0.12) add('attackerEfficiencyDrop',row.player.key,{player:playerLabel(row.player),eff:percent(f.net/f.n),baseline:percent(o.net/o.n),n:f.n,otherN:o.n},Math.min(f.n,o.n),f.n/Math.max(1,totalAttacks),gap);
    }
    for(const [value,kind] of [['tip','attackerTip'],['block_out','attackerBlockOut']] as const){
      const count=all.types.find(t=>t.value.toLowerCase()===value)?.count??0;
      if(count>=min&&count/all.attacks>=0.2) add(kind,row.player.key,{player:playerLabel(row.player),share:percent(count/all.attacks),n:all.attacks},count,share,count/all.attacks*0.3);
    }
  }
  if (!attacking) for(const row of metrics.attackers){
    const share=row.attacks/Math.max(1,totalAttacks),eff=(row.kill.count-row.errors.count)/Math.max(1,row.attacks);
    if(share>=0.15&&eff>0) add('mainAttacker',row.player.key,{player:playerLabel(row.player),share:percent(share),rate:percent(row.kill.rate),eff:percent(eff),n:row.attacks},row.attacks,share,eff);
  }
  const setterTotal=attacking?.setters.reduce((a,s)=>a+s.rotations.reduce((b,r)=>b+r.positive.attempts+r.negative.attempts,0),0)??0;
  for(const setter of attacking?.setters??[]) for(const rotation of setter.rotations) for(const bandKey of ['positive','negative'] as const){
    const band=rotation[bandKey];
    if(band.attempts<min) continue;
    const zone=[...band.zones].sort((a,b)=>b.attempts-a.attempts)[0];
    if(!zone||zone.attempts<min||zone.attempts/band.attempts<0.55) continue;
    add('setterContext',`${setter.player.key}:${rotation.rotation}:${bandKey}`,{player:playerLabel(setter.player),rotation:rotationLabel(rotation.rotation),band:bandKey==='positive'?'# / +':'! / -',zone:zone.zone,rate:percent(zone.attempts/band.attempts),n:band.attempts},zone.attempts,band.attempts/Math.max(1,setterTotal),zone.attempts/band.attempts*0.5);
  }
  const totalServes=serving?.servers.reduce((a,s)=>a+s.serves,0)??0;
  for(const server of serving?.servers??[]){
    const target=server.targetZones[0];
    if(target&&target.count>=min&&target.share>=0.4) add('serverTargetZone',server.player.key,{player:playerLabel(server.player),zone:target.value,share:percent(target.share),n:server.serves},target.count,server.serves/Math.max(1,totalServes),target.share*0.3);
  }
  // A receiver/rotation and a global receiving-rotation weakness describe the same opportunity.
  const contextualRotations=new Set(suggestions.filter(s=>s.kind==='receiverSideOut').map(s=>s.params.rotation));
  const subjects=new Set<string>();
  return suggestions.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).filter(s=>{
    if(s.kind==='weakSideOutRotation'&&contextualRotations.has(s.params.rotation)) return false;
    const family=s.kind==='receiverSideOut'?`receive:${s.params.player}`:s.kind==='setterContext'?`setter:${s.params.player}:${s.params.band}`:s.id;
    if(subjects.has(family)) return false;
    subjects.add(family);return true;
  }).slice(0,KEY_COUNT);
}
