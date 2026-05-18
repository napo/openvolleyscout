import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  clampScoutingPoint,
  findNearestScoutingZone,
  type ScoutingPoint,
  type ScoutingZone,
} from '@src/domain/spatial';

type UseCourtBallDragOptions = {
  courtRef: RefObject<HTMLDivElement>;
  snapZones: ScoutingZone[];
  initialPosition: ScoutingPoint;
  selectedZone: ScoutingZone | null;
  onZoneSnap: (zone: ScoutingZone) => void;
  onBallPointerDown?: () => void;
  onBallPositionChange?: (position: ScoutingPoint) => void;
};

type ActiveDrag = {
  pointerId: number;
};

function getRelativeCourtPoint(event: PointerEvent, rect: DOMRect): ScoutingPoint {
  return clampScoutingPoint({
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  });
}

export function useCourtBallDrag({
  courtRef,
  snapZones,
  initialPosition,
  selectedZone,
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

    if (selectedZone) {
      setBallPosition(selectedZone.center);
      return;
    }

    setBallPosition(initialPosition);
  }, [activeDrag, initialPosition, selectedZone]);

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

      const nextPoint = getRelativeCourtPoint(event, rect);
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

      const point = getRelativeCourtPoint(event, rect);
      const nearestZone = findNearestScoutingZone(point, snapZones);
      setBallPosition(nearestZone.center);
      onBallPositionChange?.(nearestZone.center);
      onZoneSnap(nearestZone);
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
