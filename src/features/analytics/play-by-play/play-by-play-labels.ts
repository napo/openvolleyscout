import type { TranslationKey } from '@src/i18n';
import type { TeamSide, SkillType } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import type { PlayByPlayRow } from './play-by-play';
export type PlayByPlayT = (key: TranslationKey, params?: Record<string, string | number>) => string;
export interface PlayByPlayOptions { reference: TeamSide; bothTeams: boolean; setNumber?: number }
const skills: Partial<Record<SkillType, TranslationKey>> = { serve: 'skillServe', receive: 'skillReceive', attack: 'skillAttack', block: 'skillBlock', set: 'skillSet', dig: 'skillDig', freeball: 'skillFreeball', cover: 'skillCover' };
const corrections = { point_added: 'manualCorrectionPointAdded', point_removed: 'manualCorrectionPointRemoved', rotation_forward: 'manualCorrectionRotationForward', rotation_backward: 'manualCorrectionRotationBackward', serve_assigned: 'manualCorrectionServeAssigned' } as const;

export function playByPlayPlayerLabel(team: Team, id: string | undefined, t: PlayByPlayT, compact = false): string {
  const player = id ? team.players.find((candidate) => candidate.id === id) : undefined;
  if (!player) return t('pbpUnknownPlayer');
  const name = compact ? player.lastName.trim() || getPlayerDisplayName(player) : getPlayerDisplayName(player);
  const number = player.jerseyNumber > 0 ? `#${player.jerseyNumber}` : '';
  return [number, name === number ? '' : name].filter(Boolean).join(' ') || t('pbpUnknownPlayer');
}
export function playByPlayDetail(row: PlayByPlayRow, side: TeamSide, teams: Record<TeamSide, Team>, options: PlayByPlayOptions, t: PlayByPlayT, compact = false): string {
  if (row.kind !== 'point') {
    if (row.teamSide !== side) return '';
    return row.kind === 'timeout' ? t('timeout') : row.kind === 'penalty' ? t('pbpPenalty') : row.correction ? t(corrections[row.correction]) : t('pointCorrection');
  }
  if (!options.bothTeams && side !== options.reference) return '';
  const touch = row.details[side];
  if (touch) return `${touch.skill === 'attack' && touch.evaluation === '/' ? t('pbpBlockedAttack') : t(skills[touch.skill] ?? 'pbpPoint')} ${touch.evaluation ?? ''} · ${playByPlayPlayerLabel(teams[side], touch.playerId, t, compact)}`;
  const opposite = side === 'home' ? 'away' : 'home';
  if (row.teamSide === side && row.details[opposite]?.evaluation === '=') return t('pbpOpponentError');
  return row.teamSide === side ? t('pbpMissingDetail') : '';
}
export function playByPlayServer(row: PlayByPlayRow, teams: Record<TeamSide, Team>, t: PlayByPlayT): string {
  if (row.kind !== 'point' || !row.servingTeam) return '—';
  const jersey = teams[row.servingTeam].players.find((player) => player.id === row.serverId)?.jerseyNumber;
  return `${t(row.servingTeam)} ${jersey && jersey > 0 ? `#${jersey}` : '—'}`;
}
