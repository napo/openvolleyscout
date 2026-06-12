import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import { getZoneCode } from '../../scouting/model/datavolley-code';

export const SIDEOUT_EVALUATIONS: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];

export const SIDEOUT_SERVE_BALL_TYPES = ['H', 'M', 'Q'] as const;
export type SideOutServeBallType = (typeof SIDEOUT_SERVE_BALL_TYPES)[number];

export const SIDEOUT_ATTACK_BALL_TYPES = ['H', 'M', 'Q', 'T', 'U', 'N', 'O'] as const;
export type SideOutAttackBallType = (typeof SIDEOUT_ATTACK_BALL_TYPES)[number];

export const SIDEOUT_SETTER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Distribution targets follow the DataVolley setter-distribution model
 * (manual §9.5.10 / attack combinations): front = zone 4 first line or 5/7
 * second line, center = zone 3, back = zone 2 first line or 1/9 second line,
 * pipe = zone 6/8, setter = second-touch attack by the setter.
 */
export type SideOutDistributionTarget = 'front' | 'center' | 'back' | 'pipe' | 'setter' | 'unknown';

export const SIDEOUT_DISTRIBUTION_TARGETS: SideOutDistributionTarget[] = [
  'front',
  'center',
  'back',
  'pipe',
  'setter',
  'unknown',
];

/** One reception-phase possession: serve → reception → set → attack. */
export interface SideOutSequence {
  setNumber: number;
  rallyNumber: number;
  teamSide: TeamSide;
  receive: BallTouch;
  set: BallTouch | null;
  attack: BallTouch | null;
  /** Serve ball height (H/M/Q) taken from the reception, falling back to the serve. */
  serveBallType: SideOutServeBallType | null;
  /** Court position (1-6) of the receiving team's setter at reception time. */
  setterPosition: number | null;
  /** Player who distributed: the setter of the set touch, or the second-touch attacker. */
  setterPlayerId: string | null;
  /** Attack ball type/height (H/M/Q/T/U/N/O) of the attack after reception. */
  attackBallType: SideOutAttackBallType | null;
  target: SideOutDistributionTarget;
  rallyWon: boolean | null;
}

export interface SideOutStudyFilters {
  team: TeamSide;
  setNumber: 'all' | number;
  setterPosition: 'all' | number;
  setterPlayerId: 'all' | string;
  receptionEvaluations: SkillEvaluation[];
  serveBallTypes: SideOutServeBallType[];
  attackEvaluations: SkillEvaluation[];
  attackBallTypes: SideOutAttackBallType[];
}

export function createDefaultSideOutStudyFilters(team: TeamSide = 'home'): SideOutStudyFilters {
  return {
    team,
    setNumber: 'all',
    setterPosition: 'all',
    setterPlayerId: 'all',
    receptionEvaluations: [...SIDEOUT_EVALUATIONS],
    serveBallTypes: [...SIDEOUT_SERVE_BALL_TYPES],
    attackEvaluations: [...SIDEOUT_EVALUATIONS],
    attackBallTypes: [...SIDEOUT_ATTACK_BALL_TYPES],
  };
}

export interface SideOutDistributionBucket {
  target: SideOutDistributionTarget;
  /** Sequences routed to this target among those matching the reception filters. */
  total: number;
  /** Subset of `total` whose attack also matches the attack-outcome filter. */
  matching: number;
  /** matching / totalSets — share of the whole filtered set distribution. */
  pctOfSets: number | null;
}

export interface SideOutDistributionResult {
  /** Denominator: sets (or setter second-touch attacks) after the reception filters. */
  totalSets: number;
  /** Receptions matching the filters that never produced a set or attack. */
  receptionsWithoutSet: number;
  buckets: Record<SideOutDistributionTarget, SideOutDistributionBucket>;
}

function isSideOutServeBallType(code: string | undefined): code is SideOutServeBallType {
  return code === 'H' || code === 'M' || code === 'Q';
}

function isSideOutAttackBallType(code: string | undefined): code is SideOutAttackBallType {
  return !!code && (SIDEOUT_ATTACK_BALL_TYPES as readonly string[]).includes(code);
}

function attackZoneNumber(attack: BallTouch): number | null {
  const code = attack.startZoneCode ?? getZoneCode(attack.originZone ?? attack.direction?.start);
  const zone = Number.parseInt(code.charAt(0), 10);
  return Number.isInteger(zone) && zone >= 1 && zone <= 9 ? zone : null;
}

function classifyTarget(set: BallTouch | null, attack: BallTouch | null): SideOutDistributionTarget {
  if (!set && attack) return 'setter';
  if (!attack) return 'unknown';

  const zone = attackZoneNumber(attack);
  switch (zone) {
    case 4:
    case 5:
    case 7:
      return 'front';
    case 3:
      return 'center';
    case 2:
    case 1:
    case 9:
      return 'back';
    case 6:
    case 8:
      return 'pipe';
    default:
      return 'unknown';
  }
}

/**
 * Extract the reception-phase possession (receive → set → attack) of the
 * receiving team from each rally. The scan stops at the first serving-team
 * touch after the reception: by then the ball has crossed, so any later
 * receiving-team touch belongs to a transition phase, not to side-out.
 */
export function extractSideOutSequences(rallies: readonly RallyStats[]): SideOutSequence[] {
  const sequences: SideOutSequence[] = [];

  for (const rally of rallies) {
    if (!rally.servingTeam) continue;
    const receivingTeam: TeamSide = rally.servingTeam === 'home' ? 'away' : 'home';

    const touches = [...rally.touches].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const receiveIndex = touches.findIndex(
      (touch) => touch.teamSide === receivingTeam && touch.skill === 'receive',
    );
    if (receiveIndex === -1) continue;
    const receive = touches[receiveIndex];

    let set: BallTouch | null = null;
    let attack: BallTouch | null = null;
    for (let i = receiveIndex + 1; i < touches.length; i += 1) {
      const touch = touches[i];
      if (touch.teamSide !== receivingTeam) break;
      if (!set && touch.skill === 'set') set = touch;
      if (!attack && touch.skill === 'attack') attack = touch;
      if (attack) break;
    }

    const serveTouch = touches.find(
      (touch) => touch.teamSide === rally.servingTeam && touch.skill === 'serve',
    );
    const receiveBallType = receive.skillTypeCode;
    const serveBallType = isSideOutServeBallType(receiveBallType)
      ? receiveBallType
      : (() => {
        const code = serveTouch?.serveType ?? serveTouch?.skillTypeCode;
        return isSideOutServeBallType(code) ? code : null;
      })();

    const setterPosition = (receivingTeam === 'home'
      ? receive.homeSetterPosition
      : receive.awaySetterPosition) ?? null;

    const attackBallTypeCode = attack?.attackType ?? attack?.skillTypeCode;

    sequences.push({
      setNumber: rally.setNumber,
      rallyNumber: rally.rallyNumber,
      teamSide: receivingTeam,
      receive,
      set,
      attack,
      serveBallType,
      setterPosition,
      setterPlayerId: set?.playerId ?? (set === null ? attack?.playerId ?? null : null),
      attackBallType: isSideOutAttackBallType(attackBallTypeCode) ? attackBallTypeCode : null,
      target: classifyTarget(set, attack),
      rallyWon: rally.pointWinner ? rally.pointWinner === receivingTeam : null,
    });
  }

  return sequences;
}

function matchesReceptionFilters(sequence: SideOutSequence, filters: SideOutStudyFilters): boolean {
  if (sequence.teamSide !== filters.team) return false;
  if (filters.setNumber !== 'all' && sequence.setNumber !== filters.setNumber) return false;
  if (filters.setterPosition !== 'all' && sequence.setterPosition !== filters.setterPosition) return false;
  if (filters.setterPlayerId !== 'all' && sequence.setterPlayerId !== filters.setterPlayerId) return false;

  if (
    filters.receptionEvaluations.length < SIDEOUT_EVALUATIONS.length
    && (!sequence.receive.evaluation || !filters.receptionEvaluations.includes(sequence.receive.evaluation))
  ) {
    return false;
  }

  if (
    filters.serveBallTypes.length < SIDEOUT_SERVE_BALL_TYPES.length
    && (!sequence.serveBallType || !filters.serveBallTypes.includes(sequence.serveBallType))
  ) {
    return false;
  }

  return true;
}

function matchesAttackFilter(sequence: SideOutSequence, filters: SideOutStudyFilters): boolean {
  if (filters.attackEvaluations.length < SIDEOUT_EVALUATIONS.length) {
    if (!sequence.attack?.evaluation) return false;
    if (!filters.attackEvaluations.includes(sequence.attack.evaluation)) return false;
  }

  if (filters.attackBallTypes.length < SIDEOUT_ATTACK_BALL_TYPES.length) {
    if (!sequence.attackBallType) return false;
    if (!filters.attackBallTypes.includes(sequence.attackBallType)) return false;
  }

  return true;
}

/**
 * Compute the setter distribution over the filtered side-out sequences.
 *
 * The denominator is the number of sets after the reception-side filters
 * (team, set, rotation, reception evaluation, serve ball height). The
 * attack-outcome filter only narrows the numerator of each target bucket,
 * so percentages always read as a share of the whole filtered distribution.
 */
export function computeSideOutDistribution(
  sequences: readonly SideOutSequence[],
  filters: SideOutStudyFilters,
): SideOutDistributionResult {
  const buckets = Object.fromEntries(
    SIDEOUT_DISTRIBUTION_TARGETS.map((target) => [
      target,
      { target, total: 0, matching: 0, pctOfSets: null } satisfies SideOutDistributionBucket,
    ]),
  ) as Record<SideOutDistributionTarget, SideOutDistributionBucket>;

  let totalSets = 0;
  let receptionsWithoutSet = 0;

  for (const sequence of sequences) {
    if (!matchesReceptionFilters(sequence, filters)) continue;

    if (!sequence.set && !sequence.attack) {
      receptionsWithoutSet += 1;
      continue;
    }

    totalSets += 1;
    const bucket = buckets[sequence.target];
    bucket.total += 1;
    if (matchesAttackFilter(sequence, filters)) {
      bucket.matching += 1;
    }
  }

  for (const bucket of Object.values(buckets)) {
    bucket.pctOfSets = totalSets === 0 ? null : bucket.matching / totalSets;
  }

  return { totalSets, receptionsWithoutSet, buckets };
}
