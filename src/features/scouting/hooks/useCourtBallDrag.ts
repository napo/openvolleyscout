import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  findNearestScoutingZone,
  getCanonicalScoutingPoint,
  type ScoutingCourtOrientation,
  type ScoutingPoint,
  type ScoutingZone,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
} from '@src/domain/spatial';
import {
  clientPointToStagePoint,
  createBallDirection,
  logTrajectoryDiagnostic,
  normalizeStagePoint,
  type BallDirection,
  type StagePoint,
} from '@src/domain/trajectory';
import { isBallNearNet, NET_DWELL_MS, NET_DWELL_TOLERANCE } from '../live/rally/rally-flow';

type UseCourtBallDragOptions = {
  courtRef: RefObject<HTMLDivElement>;
  snapZones: ScoutingZone[];
  initialPosition: ScoutingPoint;
  selectedZone: ScoutingZone | null;
  pendingPosition?: ScoutingPoint | null;
  onZoneSnap: (
    zone: ScoutingZone,
    destinationPoint?: ScoutingPoint,
    ballDirection?: BallDirection,
  ) => void;
  onBallPointerDown?: () => void;
  onBallPositionChange?: (position: ScoutingPoint) => void;
  onBallDirectionComplete?: (direction: BallDirection) => void;
  orientation?: ScoutingCourtOrientation;
};

type ActiveDrag = {
  pointerId: number;
};

export type BallDragDirection = BallDirection;

type AnnotatedScoutingPoint = ScoutingPoint & {
  isOutsideCourt?: boolean;
  courtRelativeX?: number;
  courtRelativeY?: number;
};

function getElementCenterClientPoint(element: HTMLElement): { clientX: number; clientY: number } {
  const rect = element.getBoundingClientRect();

  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

export function startBallDragDirection(point: StagePoint): BallDragDirection {
  return createBallDirection({
    start: point,
    end: point,
  });
}

export function updateBallDragDirectionEnd(
  direction: BallDragDirection,
  point: StagePoint,
): BallDragDirection {
  return createBallDirection({
    ...direction,
    end: point,
  });
}

function toCanonicalStagePoint(point: StagePoint, orientation: ScoutingCourtOrientation): StagePoint {
  return getCanonicalScoutingPoint(point, orientation);
}

function getRelativeTacticalViewportPoint(
  event: PointerEvent,
  stageElement: HTMLElement,
  orientation: ScoutingCourtOrientation,
): StagePoint {
  return toCanonicalStagePoint(clientPointToStagePoint(event, stageElement), orientation);
}

function getDirectionLength(direction: BallDirection): number {
  return Math.hypot(direction.end.x - direction.start.x, direction.end.y - direction.start.y);
}

function annotateCourtPosition(point: AnnotatedScoutingPoint): AnnotatedScoutingPoint {
  const clampedPoint = normalizeStagePoint(point, 'annotated_court_position');
  const isOutsideCourt = (
    clampedPoint.x < SCOUTING_SURFACE_INSET_X ||
    clampedPoint.x > 100 - SCOUTING_SURFACE_INSET_X ||
    clampedPoint.y < SCOUTING_SURFACE_INSET_Y ||
    clampedPoint.y > 100 - SCOUTING_SURFACE_INSET_Y
  );

  if (!isOutsideCourt) {
    return clampedPoint;
  }

  return {
    ...clampedPoint,
    isOutsideCourt,
    courtRelativeX: ((clampedPoint.x - SCOUTING_SURFACE_INSET_X) / SCOUTING_SURFACE_WIDTH) * 100,
    courtRelativeY: ((clampedPoint.y - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * 100,
  };
}

export function useCourtBallDrag({
  courtRef,
  snapZones,
  initialPosition,
  selectedZone,
  pendingPosition,
  onZoneSnap,
  onBallPointerDown,
  onBallPositionChange,
  onBallDirectionComplete,
  orientation = 'horizontal',
}: UseCourtBallDragOptions) {
  const [ballPosition, setBallPosition] = useState<ScoutingPoint>(initialPosition);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dragDirection, setDragDirection] = useState<BallDragDirection | null>(null);
  const dragDirectionRef = useRef<BallDragDirection | null>(null);
  // Mid-drag pause at the net, within a single continuous gesture: the ball
  // stops crossing horizontally for a moment (finger lingers) before the
  // gesture continues to its final release point. Treated as an implicit
  // block touch — see NET_DWELL_TOLERANCE/NET_DWELL_MS in rally-flow.ts.
  const netDwellEntryRef = useRef<{ enteredAt: number; point: StagePoint } | null>(null);
  const netDwellPointRef = useRef<StagePoint | null>(null);

  const updateDragDirection = (point: StagePoint): BallDirection => {
    const currentDirection = dragDirectionRef.current ?? startBallDragDirection(point);
    const nextDirection = updateBallDragDirectionEnd(currentDirection, point);

    dragDirectionRef.current = nextDirection;
    setDragDirection(nextDirection);

    if (getDirectionLength(nextDirection) === 0) {
      logTrajectoryDiagnostic('zero_length_drag_direction', {
        start: nextDirection.start,
        end: nextDirection.end,
      });
    }

    return nextDirection;
  };

  const trackNetDwell = (point: StagePoint): void => {
    if (!isBallNearNet(point.x, NET_DWELL_TOLERANCE)) {
      netDwellEntryRef.current = null;
      return;
    }

    if (!netDwellEntryRef.current) {
      netDwellEntryRef.current = { enteredAt: performance.now(), point };
      return;
    }

    if (!netDwellPointRef.current && performance.now() - netDwellEntryRef.current.enteredAt >= NET_DWELL_MS) {
      netDwellPointRef.current = netDwellEntryRef.current.point;
    }
  };

  useEffect(() => {
    if (activeDrag) {
      return;
    }

    if (pendingPosition) {
      setBallPosition(pendingPosition);
      return;
    }

    if (selectedZone) {
      setBallPosition(selectedZone.center);
      return;
    }

    setBallPosition(initialPosition);
  }, [activeDrag, initialPosition, pendingPosition, selectedZone]);

  useEffect(() => {
    if (activeDrag || pendingPosition) {
      return;
    }

    dragDirectionRef.current = null;
    setDragDirection(null);
  }, [activeDrag, pendingPosition]);

  useEffect(() => {
    if (!activeDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const stageElement = courtRef.current;
      if (!stageElement) {
        return;
      }

      const nextPoint = annotateCourtPosition(getRelativeTacticalViewportPoint(event, stageElement, orientation));
      setBallPosition(nextPoint);
      updateDragDirection(nextPoint);
      trackNetDwell(nextPoint);
      onBallPositionChange?.(nextPoint);
    };

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const stageElement = courtRef.current;
      if (!stageElement) {
        setActiveDrag(null);
        return;
      }

      const point = annotateCourtPosition(getRelativeTacticalViewportPoint(event, stageElement, orientation));
      const containingZone = snapZones.find((zone) => {
        return (
          point.x >= zone.bounds.x &&
          point.x <= zone.bounds.x + zone.bounds.width &&
          point.y >= zone.bounds.y &&
          point.y <= zone.bounds.y + zone.bounds.height
        );
      });
      const nearestZone = snapZones.length > 0 ? findNearestScoutingZone(point, snapZones) : null;

      const rawDirection = updateDragDirection(point);
      const ballDirection = netDwellPointRef.current
        ? { ...rawDirection, via: [netDwellPointRef.current] }
        : rawDirection;

      if (containingZone) {
        setBallPosition(containingZone.center);
        onBallPositionChange?.(containingZone.center);
        onBallDirectionComplete?.(ballDirection);
        onZoneSnap(containingZone, containingZone.center, ballDirection);
      } else if (nearestZone) {
        setBallPosition(point);
        onBallPositionChange?.(point);
        onBallDirectionComplete?.(ballDirection);
        onZoneSnap(nearestZone, point, ballDirection);
      } else {
        setBallPosition(point);
        onBallPositionChange?.(point);
        onBallDirectionComplete?.(ballDirection);
      }

      setActiveDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [activeDrag, courtRef, onBallDirectionComplete, onBallPositionChange, onZoneSnap, orientation, snapZones]);

  const handleBallPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onBallPointerDown?.();
    netDwellEntryRef.current = null;
    netDwellPointRef.current = null;

    const stageElement = courtRef.current;
    const renderedBallCenter = stageElement
      ? toCanonicalStagePoint(clientPointToStagePoint(getElementCenterClientPoint(event.currentTarget), stageElement), orientation)
      : normalizeStagePoint(ballPosition, 'ball_pointer_down_fallback');
    const pointerPoint = stageElement
      ? toCanonicalStagePoint(clientPointToStagePoint(event, stageElement), orientation)
      : renderedBallCenter;

    setBallPosition(renderedBallCenter);
    onBallPositionChange?.(renderedBallCenter);

    const nextDirection = updateBallDragDirectionEnd(
      startBallDragDirection(renderedBallCenter),
      pointerPoint,
    );
    logTrajectoryDiagnostic('ball_drag_start', {
      start: nextDirection.start,
      end: nextDirection.end,
    });
    if (getDirectionLength(nextDirection) === 0) {
      logTrajectoryDiagnostic('zero_length_drag_direction', {
        start: nextDirection.start,
        end: nextDirection.end,
      });
    }
    dragDirectionRef.current = nextDirection;
    setDragDirection(nextDirection);
    setActiveDrag({ pointerId: event.pointerId });
  };

  const snapToZone = (zone: ScoutingZone) => {
    setBallPosition(zone.center);
    onBallPositionChange?.(zone.center);
    onZoneSnap(zone);
  };

  return {
    ballPosition,
    isDragging: activeDrag !== null,
    dragDirection,
    handleBallPointerDown,
    snapToZone,
  };
}
