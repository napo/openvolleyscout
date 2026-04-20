import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { clampCourtPoint, findNearestCourtZone, type CourtPoint, type CourtZone } from '@src/domain/court';

type UseCourtBallDragOptions = {
  courtRef: RefObject<HTMLDivElement>;
  zones: CourtZone[];
  initialPosition: CourtPoint;
  selectedZone: CourtZone | null;
  onZoneSnap: (zone: CourtZone) => void;
};

type ActiveDrag = {
  pointerId: number;
};

function getRelativeCourtPoint(event: PointerEvent, rect: DOMRect): CourtPoint {
  return clampCourtPoint({
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
  const [ballPosition, setBallPosition] = useState<CourtPoint>(initialPosition);
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
      const nearestZone = findNearestCourtZone(point, zones);
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

  const snapToZone = (zone: CourtZone) => {
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
