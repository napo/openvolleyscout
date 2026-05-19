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
  BALL_TRAJECTORY_MAX_POINTS,
  simplifyBallTrajectoryPoints,
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

type AnnotatedScoutingPoint = ScoutingPoint & {
  isOutsideCourt?: boolean;
  courtRelativeX?: number;
  courtRelativeY?: number;
};

function getRelativeTacticalViewportPoint(event: PointerEvent, rect: DOMRect): AnnotatedScoutingPoint {
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
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
  const [dragTrajectoryPoints, setDragTrajectoryPoints] = useState<BallTrajectoryPoint[] | null>(null);
  const dragTrajectoryPointsRef = useRef<BallTrajectoryPoint[] | null>(null);

  const updateDragTrajectory = (point: ScoutingPoint): BallTrajectoryPoint[] => {
    const points = simplifyBallTrajectoryPoints([
      ...(dragTrajectoryPointsRef.current ?? []),
      {
        ...point,
        timestamp: Date.now(),
      },
    ], {
      maxPoints: BALL_TRAJECTORY_MAX_POINTS,
    });

    dragTrajectoryPointsRef.current = points;
    setDragTrajectoryPoints(points);

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

    dragTrajectoryPointsRef.current = null;
    setDragTrajectoryPoints(null);
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

      if (containingZone) {
        const trajectoryPoints = updateDragTrajectory(containingZone.center);
        setBallPosition(containingZone.center);
        onBallPositionChange?.(containingZone.center);
        onBallTrajectoryComplete?.(trajectoryPoints);
        onZoneSnap(containingZone, containingZone.center, trajectoryPoints);
      } else if (nearestZone) {
        const trajectoryPoints = updateDragTrajectory(point);
        setBallPosition(point);
        onBallPositionChange?.(point);
        onBallTrajectoryComplete?.(trajectoryPoints);
        onZoneSnap(nearestZone, point, trajectoryPoints);
      } else {
        const trajectoryPoints = updateDragTrajectory(point);
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
    onBallPositionChange?.(ballPosition);
    const startPoint = {
      ...ballPosition,
      timestamp: Date.now(),
    };
    dragTrajectoryPointsRef.current = [startPoint];
    setDragTrajectoryPoints([startPoint]);
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
    dragTrajectoryPoints,
    handleBallPointerDown,
    snapToZone,
  };
}
