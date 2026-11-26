// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What every event of the log does to the court: who serves, who rotates, how the score moves and
// who replaces whom. This is the single place for those rules. The match report, the play by play,
// Video analysis, the opponent reports and the DataVolley export each keep their own picture of the
// court (active lineups, jersey numbers, plain slots...) but all read the events through here, so a
// red card, a point without rotation or a manual correction means the same thing everywhere.
//
// Pure module with type-only imports: it also runs in the ts-node test scripts.

import type { TeamSide } from '../common/enums';
import type { MatchEvent } from './types';

type EventOf<Type extends MatchEvent['type']> = Extract<MatchEvent, { type: Type }>;

export type CourtOp =
  /** A set starts from its own lineups; the score is back to 0-0. */
  | { kind: 'set_start'; event: EventOf<'set_started'> }
  /** One point more (or, for a manual correction, one less) for a team. */
  | { kind: 'score'; teamSide: TeamSide; delta: 1 | -1 }
  /** Forward is the side-out rotation (the player in 2 goes to 1); backward undoes it. */
  | { kind: 'rotate'; teamSide: TeamSide; direction: 'forward' | 'backward' }
  /** The team that serves the next rally. */
  | { kind: 'serve'; teamSide: TeamSide }
  | { kind: 'substitution'; event: EventOf<'substitution_made'> }
  | { kind: 'libero'; event: EventOf<'libero_replacement_made'> }
  | { kind: 'setter'; event: EventOf<'setter_assigned'> };

export interface CourtScore {
  home: number;
  away: number;
}

export interface CourtOpsReader {
  /** The team serving the next rally, as left by the events read so far. */
  readonly servingTeam: TeamSide | null;
  /** The score of the current set, as left by the events read so far. */
  readonly score: Readonly<CourtScore>;
  /**
   * The court operations of one event, in the order they happen (score, rotation, serve), and
   * advances the serve and the score. Events that do not touch the court give no operation.
   * `skipRotation` lets a caller hold the side-out rotation of a point (the event's own
   * `skipRotation` is always honoured).
   */
  read(event: MatchEvent, options?: { skipRotation?: boolean }): CourtOp[];
}

export function createCourtOpsReader(): CourtOpsReader {
  let servingTeam: TeamSide | null = null;
  let score: CourtScore = { home: 0, away: 0 };

  const addScore = (teamSide: TeamSide, delta: 1 | -1) => {
    score = { ...score, [teamSide]: Math.max(0, score[teamSide] + delta) };
  };

  return {
    get servingTeam() { return servingTeam; },
    get score() { return score; },
    read(event, options = {}) {
      switch (event.type) {
        case 'set_started':
          servingTeam = event.servingTeam;
          score = { home: 0, away: 0 };
          return [{ kind: 'set_start', event }];
        case 'point_awarded':
        case 'red_card_point': {
          const skip = options.skipRotation === true || (event.type === 'point_awarded' && event.skipRotation === true);
          const ops: CourtOp[] = [{ kind: 'score', teamSide: event.teamSide, delta: 1 }];
          // The team that wins the point while receiving rotates before serving.
          if (servingTeam && servingTeam !== event.teamSide && !skip) {
            ops.push({ kind: 'rotate', teamSide: event.teamSide, direction: 'forward' });
          }
          ops.push({ kind: 'serve', teamSide: event.teamSide });
          addScore(event.teamSide, 1);
          servingTeam = event.teamSide;
          return ops;
        }
        case 'manual_correction':
          switch (event.correction) {
            case 'point_added':
              addScore(event.teamSide, 1);
              return [{ kind: 'score', teamSide: event.teamSide, delta: 1 }];
            case 'point_removed':
              addScore(event.teamSide, -1);
              return [{ kind: 'score', teamSide: event.teamSide, delta: -1 }];
            case 'rotation_forward':
              return [{ kind: 'rotate', teamSide: event.teamSide, direction: 'forward' }];
            case 'rotation_backward':
              return [{ kind: 'rotate', teamSide: event.teamSide, direction: 'backward' }];
            case 'serve_assigned':
              servingTeam = event.teamSide;
              return [{ kind: 'serve', teamSide: event.teamSide }];
            default:
              return [];
          }
        case 'substitution_made':
          return [{ kind: 'substitution', event }];
        case 'libero_replacement_made':
          return [{ kind: 'libero', event }];
        case 'setter_assigned':
          return [{ kind: 'setter', event }];
        default:
          return [];
      }
    },
  };
}

/**
 * A rally keeps one point: when the log holds several `point_awarded` for the same rally (the point
 * was given again), the latest one counts. Returns the ids of the points that count.
 */
export function canonicalPointEventIds(events: readonly MatchEvent[]): Set<string> {
  const latest = new Map<string, EventOf<'point_awarded'>>();
  for (const event of events) {
    if (event.type !== 'point_awarded') continue;
    const key = `${event.setNumber}:${event.rallyNumber}`;
    if ((latest.get(key)?.createdAt ?? -Infinity) <= event.createdAt) latest.set(key, event);
  }
  return new Set([...latest.values()].map((event) => event.id));
}
