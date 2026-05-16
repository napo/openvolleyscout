import type { BallTouch } from '@src/domain/touch/types';
import type { PendingTouch } from '../../model/datavolley-flow';

export function shouldReplaceLatestPendingTouch(
  latestTouch: BallTouch | null,
  draft: PendingTouch,
  setNumber: number,
  rallyNumber: number,
): latestTouch is BallTouch {
  if (!latestTouch) {
    return false;
  }

  return (
    latestTouch.setNumber === setNumber
    && latestTouch.rallyNumber === rallyNumber
    && latestTouch.teamSide === draft.teamSide
    && latestTouch.playerId === draft.playerId
    && latestTouch.skill === draft.skill
  );
}
