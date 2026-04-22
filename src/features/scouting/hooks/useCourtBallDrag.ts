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
  zones: ScoutingZone[];
  initialPosition: ScoutingPoint;
  selectedZone: ScoutingZone | null;
  onZoneSnap: (zone: ScoutingZone) => void;
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
  zones,
  initialPosition,
  selectedZone,
  onZoneSnap,
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

      setBallPosition(getRelativeCourtPoint(event, rect));
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
      const nearestZone = findNearestScoutingZone(point, zones);
      setBallPosition(nearestZone.center);
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
  }, [activeDrag, courtRef, onZoneSnap, zones]);

  const handleBallPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setActiveDrag({ pointerId: event.pointerId });
  };

  const snapToZone = (zone: ScoutingZone) => {
    setBallPosition(zone.center);
    onZoneSnap(zone);
  };

  return {
    ballPosition,
    isDragging: activeDrag !== null,
    handleBallPointerDown,
    snapToZone,
  };
}
