import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  clampScoutingPoint,
  findNearestScoutingZone,
  type ScoutingPoint,
  type ScoutingZone,
  SCOUTING_SURFACE_HEIGHT,
  SCOUTING_SURFACE_INSET_X,
  SCOUTING_SURFACE_INSET_Y,
  SCOUTING_SURFACE_WIDTH,
} from '@src/domain/spatial';
import {
  type BallTrajectoryPoint,
} from '@src/domain/trajectory';

type UseCourtBallDragOptions = {
  courtRef: RefObject<HTMLDivElement>;
  snapZones: ScoutingZone[];
  initialPosition: ScoutingPoint;
  selectedZone: ScoutingZone | null;
  pendingPosition?: ScoutingPoint | null;
  onZoneSnap: (
    zone: ScoutingZone,
    destinationPoint?: ScoutingPoint,
    trajectoryPoints?: BallTrajectoryPoint[],
  ) => void;
  onBallPointerDown?: () => void;
  onBallPositionChange?: (position: ScoutingPoint) => void;
  onBallTrajectoryComplete?: (points: BallTrajectoryPoint[]) => void;
};

type ActiveDrag = {
  pointerId: number;
};

export type BallDragTrajectory = {
  startPoint: BallTrajectoryPoint;
  endPoint: BallTrajectoryPoint;
};

type AnnotatedScoutingPoint = ScoutingPoint & {
  isOutsideCourt?: boolean;
  courtRelativeX?: number;
  courtRelativeY?: number;
};

function toBallTrajectoryPoint(point: ScoutingPoint, timestamp = Date.now()): BallTrajectoryPoint {
  return {
    ...point,
    timestamp,
  };
}

export function getStagePointFromClientPoint(
  clientPoint: { clientX: number; clientY: number },
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): ScoutingPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }

  return clampScoutingPoint({
    x: ((clientPoint.clientX - rect.left) / rect.width) * 100,
    y: ((clientPoint.clientY - rect.top) / rect.height) * 100,
  });
}

export function getStagePointFromElementCenter(
  elementRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  stageRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): ScoutingPoint {
  return getStagePointFromClientPoint({
    clientX: elementRect.left + elementRect.width / 2,
    clientY: elementRect.top + elementRect.height / 2,
  }, stageRect);
}

export function startBallDragTrajectory(point: ScoutingPoint, timestamp = Date.now()): BallDragTrajectory {
  const startPoint = toBallTrajectoryPoint(point, timestamp);

  return {
    startPoint,
    endPoint: startPoint,
  };
}

export function updateBallDragTrajectoryEnd(
  trajectory: BallDragTrajectory,
  point: ScoutingPoint,
  timestamp = Date.now(),
): BallDragTrajectory {
  return {
    startPoint: trajectory.startPoint,
    endPoint: toBallTrajectoryPoint(point, timestamp),
  };
}

export function getBallDragTrajectoryPoints(trajectory: BallDragTrajectory): BallTrajectoryPoint[] {
  return [trajectory.startPoint, trajectory.endPoint];
}

function getRelativeTacticalViewportPoint(event: PointerEvent, rect: DOMRect): AnnotatedScoutingPoint {
  return getStagePointFromClientPoint(event, rect);
}

function annotateCourtPosition(point: AnnotatedScoutingPoint): AnnotatedScoutingPoint {
  const clampedPoint = clampScoutingPoint(point);
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
  onBallTrajectoryComplete,
}: UseCourtBallDragOptions) {
  const [ballPosition, setBallPosition] = useState<ScoutingPoint>(initialPosition);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dragTrajectory, setDragTrajectory] = useState<BallDragTrajectory | null>(null);
  const dragTrajectoryRef = useRef<BallDragTrajectory | null>(null);

  const updateDragTrajectory = (point: ScoutingPoint): BallTrajectoryPoint[] => {
    const currentTrajectory = dragTrajectoryRef.current ?? startBallDragTrajectory(point);
    const nextTrajectory = updateBallDragTrajectoryEnd(currentTrajectory, point);
    const points = getBallDragTrajectoryPoints(nextTrajectory);

    dragTrajectoryRef.current = nextTrajectory;
    setDragTrajectory(nextTrajectory);

    return points;
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

    dragTrajectoryRef.current = null;
    setDragTrajectory(null);
  }, [activeDrag, pendingPosition]);

  useEffect(() => {
    if (!activeDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const rect = courtRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const nextPoint = annotateCourtPosition(getRelativeTacticalViewportPoint(event, rect));
      setBallPosition(nextPoint);
      updateDragTrajectory(nextPoint);
      onBallPositionChange?.(nextPoint);
    };

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== activeDrag.pointerId) {
        return;
      }

      const rect = courtRef.current?.getBoundingClientRect();
      if (!rect) {
        setActiveDrag(null);
        return;
      }

      const point = annotateCourtPosition(getRelativeTacticalViewportPoint(event, rect));
      const containingZone = snapZones.find((zone) => {
        return (
          point.x >= zone.bounds.x &&
          point.x <= zone.bounds.x + zone.bounds.width &&
          point.y >= zone.bounds.y &&
          point.y <= zone.bounds.y + zone.bounds.height
        );
      });
      const nearestZone = snapZones.length > 0 ? findNearestScoutingZone(point, snapZones) : null;

      const trajectoryPoints = updateDragTrajectory(point);

      if (containingZone) {
        setBallPosition(containingZone.center);
        onBallPositionChange?.(containingZone.center);
        onBallTrajectoryComplete?.(trajectoryPoints);
        onZoneSnap(containingZone, containingZone.center, trajectoryPoints);
      } else if (nearestZone) {
        setBallPosition(point);
        onBallPositionChange?.(point);
        onBallTrajectoryComplete?.(trajectoryPoints);
        onZoneSnap(nearestZone, point, trajectoryPoints);
      } else {
        setBallPosition(point);
        onBallPositionChange?.(point);
        onBallTrajectoryComplete?.(trajectoryPoints);
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
  }, [activeDrag, courtRef, onBallPositionChange, onBallTrajectoryComplete, onZoneSnap, snapZones]);

  const handleBallPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onBallPointerDown?.();
    const stageRect = courtRef.current?.getBoundingClientRect();
    const renderedBallCenter = stageRect
      ? getStagePointFromElementCenter(event.currentTarget.getBoundingClientRect(), stageRect)
      : ballPosition;

    setBallPosition(renderedBallCenter);
    onBallPositionChange?.(renderedBallCenter);
    const nextTrajectory = startBallDragTrajectory(renderedBallCenter);
    dragTrajectoryRef.current = nextTrajectory;
    setDragTrajectory(nextTrajectory);
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
    dragTrajectoryPoints: dragTrajectory ? getBallDragTrajectoryPoints(dragTrajectory) : null,
    handleBallPointerDown,
    snapToZone,
  };
}
