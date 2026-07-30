import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';

/**
 * Touch IDs used to be minted from `Date.now()` alone (millisecond
 * resolution). Two touches created in the same millisecond — routine for an
 * inferred touch immediately following the one it's inferred from (e.g. a
 * serve inferred from a reception) — ended up sharing an ID. Since match
 * stats deduplicate touches by ID, one of the two was silently dropped from
 * every derived stat, including the side-out study. IDs are now minted with
 * crypto.randomUUID(), but matches scouted before that fix still carry the
 * collision in storage. This repairs those in place.
 */
function touchSignature(touch: BallTouch): string {
  return [touch.setNumber, touch.rallyNumber, touch.sequenceNumber, touch.teamSide, touch.skill].join(':');
}

function withReassignedId(touch: BallTouch): BallTouch {
  const newId = `touch-${crypto.randomUUID()}`;
  return {
    ...touch,
    id: newId,
    trajectory: touch.trajectory
      ? { ...touch.trajectory, id: `trajectory-${newId}`, rallyTouchId: newId }
      : touch.trajectory,
  };
}

export interface TouchIdRepairResult {
  project: MatchProject;
  fixedCount: number;
}

/**
 * Reassigns a fresh ID to any touch whose ID collides with a genuinely
 * different touch (different set/rally/sequence/side/skill). Touches that
 * legitimately share an ID (the same touch re-emitted, e.g. after a
 * redraw/correction) are left untouched — only true collisions are fixed.
 */
export function repairTouchIdCollisions(project: MatchProject): TouchIdRepairResult {
  const claimedSignatureById = new Map<string, string>();
  let fixedCount = 0;

  const nextEvents: MatchEvent[] = project.events.map((event) => {
    if (event.type !== 'touch_recorded') {
      return event;
    }

    const signature = touchSignature(event.touch);
    const claimedSignature = claimedSignatureById.get(event.touch.id);

    if (claimedSignature === undefined) {
      claimedSignatureById.set(event.touch.id, signature);
      return event;
    }

    if (claimedSignature === signature) {
      return event;
    }

    fixedCount += 1;
    return { ...event, touch: withReassignedId(event.touch) };
  });

  if (fixedCount === 0) {
    return { project, fixedCount: 0 };
  }

  return {
    project: { ...project, events: nextEvents, updatedAt: Date.now() },
    fixedCount,
  };
}
