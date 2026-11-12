import type { PlayerRole, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import { getRoleLabel, type RoleLabelLocale } from '@src/domain/systems/role-labels';
import { PlayerRole as TacticalRole } from '@src/domain/systems/types';

/**
 * Tag input: guesses who touches the ball next and with which skill, so a
 * typical rally is tagged with "player → evaluation" (serve: evaluation only).
 * The scout can always override the team, player or skill.
 */

export const TAG_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];

const SKILL_LETTER: Partial<Record<SkillType, string>> = {
  serve: 'S',
  receive: 'R',
  set: 'E',
  attack: 'A',
  block: 'B',
  dig: 'D',
  freeball: 'F',
  cover: 'C',
};

const TACTICAL_TO_PLAYER_ROLE: Record<TacticalRole, PlayerRole> = {
  [TacticalRole.SETTER]: 'setter',
  [TacticalRole.OPPOSITE]: 'opposite',
  [TacticalRole.OUTSIDE_HITTER_1]: 'outside_hitter',
  [TacticalRole.OUTSIDE_HITTER_2]: 'outside_hitter',
  [TacticalRole.MIDDLE_BLOCKER_1]: 'middle_blocker',
  [TacticalRole.MIDDLE_BLOCKER_2]: 'middle_blocker',
  [TacticalRole.LIBERO]: 'libero',
};

export type TagSuggestion = {
  teamSide: TeamSide;
  skill: SkillType;
};

type RallyTouchLike = {
  teamSide: TeamSide;
  skill: SkillType;
};

function opposite(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function suggestNextTag(input: {
  servingTeam: TeamSide | null;
  currentRallyTouches: RallyTouchLike[];
}): TagSuggestion | null {
  const last = input.currentRallyTouches.at(-1);
  if (!last) {
    return input.servingTeam ? { teamSide: input.servingTeam, skill: 'serve' } : null;
  }

  switch (last.skill) {
    case 'serve':
      return { teamSide: opposite(last.teamSide), skill: 'receive' };
    case 'receive':
    case 'dig':
    case 'freeball':
    case 'cover':
    case 'set':
      // Sets are optional in tag input: go straight to the attack.
      return { teamSide: last.teamSide, skill: 'attack' };
    case 'attack':
      return { teamSide: opposite(last.teamSide), skill: 'dig' };
    case 'block':
      // A block touch usually lands back on the attacking side.
      return { teamSide: opposite(last.teamSide), skill: 'dig' };
    default:
      return { teamSide: last.teamSide, skill: 'attack' };
  }
}

/**
 * DataVolley code for one tagged touch, e.g. "*07A#", or with the optional
 * details "*05EQK1#" (ball type Q, setter call K1). Zones are never tagged.
 * The setter calls offered (K1, K7, K2 ...) belong on the set row only: on an
 * attack row they would read as an unknown attack combination.
 */
export function buildTagCode(input: {
  teamSide: TeamSide;
  jerseyNumber: number;
  skill: SkillType;
  evaluation: SkillEvaluation;
  ballType?: string | null;
  combination?: string | null;
}): string {
  const team = input.teamSide === 'home' ? '*' : 'a';
  const jersey = String(input.jerseyNumber).padStart(2, '0');
  const combination = input.skill === 'set' ? input.combination ?? '' : '';
  return `${team}${jersey}${SKILL_LETTER[input.skill] ?? 'A'}${input.ballType ?? ''}${combination}${input.evaluation}`;
}

/**
 * Resolves a player's role and localized short badge for the Tag pad.
 * When the setter is on court, outside hitters and middle blockers are
 * numbered by proximity to the setter in rotation order (1 = adjacent to the
 * setter, e.g. S1 / C1 in Italian; 2 = distant from the setter / adjacent to
 * the opposite, e.g. S2 / C2 in Italian).
 */
export function resolvePlayerTagRole(
  lineup: Pick<ActiveLineup, 'slots' | 'setterPlayerId' | 'liberoPlayerIds'> | null,
  player: Pick<Player, 'id' | 'role' | 'isLibero'>,
  locale: RoleLabelLocale = 'it',
): { role?: PlayerRole; badge?: string } {
  const slot = lineup?.slots.find((candidate) => candidate.playerId === player.id);
  const setterId = lineup?.setterPlayerId && lineup.slots.some((candidate) => candidate.playerId === lineup.setterPlayerId)
    ? lineup.setterPlayerId
    : undefined;
  const setterSlot = setterId
    ? lineup?.slots.find((candidate) => candidate.playerId === setterId)
    : lineup?.slots.find((candidate) => candidate.tacticalRole === TacticalRole.SETTER);

  const role: PlayerRole | undefined = (() => {
    if (
      player.isLibero
      || lineup?.liberoPlayerIds.includes(player.id)
      || slot?.tacticalRole === TacticalRole.LIBERO
      || player.role === 'libero'
    ) {
      return 'libero';
    }
    if (setterId === player.id || slot?.tacticalRole === TacticalRole.SETTER || player.role === 'setter') {
      return 'setter';
    }
    if (slot?.tacticalRole) {
      return TACTICAL_TO_PLAYER_ROLE[slot.tacticalRole];
    }
    return player.role;
  })();

  if (!role) {
    return {};
  }

  if (role === 'libero') {
    return { role, badge: getRoleLabel(TacticalRole.LIBERO, locale) };
  }
  if (role === 'setter') {
    return { role, badge: getRoleLabel(TacticalRole.SETTER, locale) };
  }
  if (role === 'opposite') {
    return { role, badge: getRoleLabel(TacticalRole.OPPOSITE, locale) };
  }
  if (role === 'defensive_specialist') {
    return { role, badge: 'DS' };
  }

  if (slot && setterSlot) {
    const offset = (slot.courtPosition - setterSlot.courtPosition + 6) % 6;
    if (offset === 1 || offset === 5) {
      const tactical = role === 'outside_hitter' ? TacticalRole.OUTSIDE_HITTER_1 : TacticalRole.MIDDLE_BLOCKER_1;
      return { role, badge: getRoleLabel(tactical, locale) };
    }
    if (offset === 2 || offset === 4) {
      const tactical = role === 'outside_hitter' ? TacticalRole.OUTSIDE_HITTER_2 : TacticalRole.MIDDLE_BLOCKER_2;
      return { role, badge: getRoleLabel(tactical, locale) };
    }
  }

  if (
    slot?.tacticalRole === TacticalRole.OUTSIDE_HITTER_1
    || slot?.tacticalRole === TacticalRole.OUTSIDE_HITTER_2
    || slot?.tacticalRole === TacticalRole.MIDDLE_BLOCKER_1
    || slot?.tacticalRole === TacticalRole.MIDDLE_BLOCKER_2
  ) {
    return { role, badge: getRoleLabel(slot.tacticalRole, locale) };
  }

  const baseTactical = role === 'outside_hitter' ? TacticalRole.OUTSIDE_HITTER_1 : TacticalRole.MIDDLE_BLOCKER_1;
  return { role, badge: getRoleLabel(baseTactical, locale).replace(/[12]$/, '') };
}
