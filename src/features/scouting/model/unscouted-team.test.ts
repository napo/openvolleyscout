// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '../../../domain/touch/types';
import { buildTouchRecordedEvent } from './rally';
import {
  TEAM_PLACEHOLDER_PLAYER_ID,
  getTeamMarkerLabel,
  isUnscoutedTeam,
  stripTeamPlaceholderPlayer,
} from './unscouted-team';

const touch = (playerId?: string) => ({
  id: 't1', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'away', skill: 'attack', evaluation: '#',
  createdAt: 1, ...(playerId ? { playerId } : {}),
}) as BallTouch;

describe('unscouted team', () => {
  it('is a team with no match roster', () => {
    expect(isUnscoutedTeam({ players: [] })).toBe(true);
    expect(isUnscoutedTeam({ players: [{ id: 'p' }] as never })).toBe(false);
    expect(isUnscoutedTeam(null)).toBe(false);
  });

  it('labels the team marker with the first letters of the name', () => {
    expect(getTeamMarkerLabel('Opponent')).toBe('OPP');
    expect(getTeamMarkerLabel('A.S. Volley')).toBe('ASV');
    expect(getTeamMarkerLabel('')).toBe('?');
  });

  it('records team touches with no player', () => {
    expect(stripTeamPlaceholderPlayer(touch(TEAM_PLACEHOLDER_PLAYER_ID))).not.toHaveProperty('playerId');
    expect(stripTeamPlaceholderPlayer(touch('p7')).playerId).toBe('p7');
    const event = buildTouchRecordedEvent(touch(TEAM_PLACEHOLDER_PLAYER_ID));
    expect(event.type === 'touch_recorded' && event.touch.playerId).toBeFalsy();
  });
});
