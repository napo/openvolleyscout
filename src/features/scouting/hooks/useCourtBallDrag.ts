import { useEffect, useState } from 'react';
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

type UseCourtBallDragOptions = {
  courtRef: RefObject<HTMLDivElement>;
  snapZones: ScoutingZone[];
  initialPosition: ScoutingPoint;
  selectedZone: ScoutingZone | null;
  pendingPosition?: ScoutingPoint | null;
  onZoneSnap: (zone: ScoutingZone, destinationPoint?: ScoutingPoint) => void;
  onBallPointerDown?: () => void;
  onBallPositionChange?: (position: ScoutingPoint) => void;
};

type ActiveDrag = {
  pointerId: number;
};

type AnnotatedScoutingPoint = ScoutingPoint & {
  isOutsideCourt?: boolean;
  courtRelativeX?: number;
  courtRelativeY?: number;
};

function getRelativeCourtPoint(event: PointerEvent, rect: DOMRect): AnnotatedScoutingPoint {
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function annotateCourtPosition(point: AnnotatedScoutingPoint): AnnotatedScoutingPoint {
  const isOutsideCourt = (
    point.x < SCOUTING_SURFACE_INSET_X ||
    point.x > 100 - SCOUTING_SURFACE_INSET_X ||
    point.y < SCOUTING_SURFACE_INSET_Y ||
    point.y > 100 - SCOUTING_SURFACE_INSET_Y
  );

  if (!isOutsideCourt) {
    return point;
  }

  return {
    ...point,
    isOutsideCourt,
    courtRelativeX: ((point.x - SCOUTING_SURFACE_INSET_X) / SCOUTING_SURFACE_WIDTH) * 100,
    courtRelativeY: ((point.y - SCOUTING_SURFACE_INSET_Y) / SCOUTING_SURFACE_HEIGHT) * 100,
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
}: UseCourtBallDragOptions) {
  const [ballPosition, setBallPosition] = useState<ScoutingPoint>(initialPosition);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

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

      const nextPoint = annotateCourtPosition(getRelativeCourtPoint(event, rect));
      setBallPosition(nextPoint);
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

      const point = annotateCourtPosition(getRelativeCourtPoint(event, rect));
      const containingZone = snapZones.find((zone) => {
        return (
          point.x >= zone.bounds.x &&
          point.x <= zone.bounds.x + zone.bounds.width &&
          point.y >= zone.bounds.y &&
          point.y <= zone.bounds.y + zone.bounds.height
        );
      });
      const nearestZone = findNearestScoutingZone(point, snapZones);

      if (containingZone) {
        setBallPosition(containingZone.center);
        onBallPositionChange?.(containingZone.center);
        onZoneSnap(containingZone, containingZone.center);
      } else if (nearestZone) {
        setBallPosition(point);
        onBallPositionChange?.(point);
        onZoneSnap(nearestZone, point);
      } else {
        setBallPosition(point);
        onBallPositionChange?.(point);
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
  }, [activeDrag, courtRef, onBallPositionChange, onZoneSnap, snapZones]);

  const handleBallPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onBallPointerDown?.();
    onBallPositionChange?.(ballPosition);
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
    handleBallPointerDown,
    snapToZone,
  };
}
