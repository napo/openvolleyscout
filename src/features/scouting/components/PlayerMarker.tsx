import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { TeamSide } from '@src/domain/common/enums';
import { createMarkerPositionStyle } from '../live/animation/marker-animation';

type PlayerMarkerProps = {
  playerId: string;
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: TeamSide;
  onSelect?: (playerId: string, teamSide: TeamSide) => void;
  isSetter?: boolean;
  isLibero?: boolean;
  isSelectedForTouch?: boolean;
  isAwaitingSelection?: boolean;
  isDisabled?: boolean;
  replacingPlayerLabel?: string;
  /** Smaller marker for a player beside the court (off-court libero, player out for the libero). */
  isSideline?: boolean;
  /**
   * Makes the marker draggable: dropping it on another player marker calls
   * this with that player (a sideline libero dragged onto the court).
   */
  onDropOnPlayer?: (playerId: string, teamSide: TeamSide, targetPlayerId: string) => void;
};

// Pointer travel (px) that turns a press into a drag instead of a tap.
const DRAG_THRESHOLD = 8;

export function PlayerMarker({
  playerId,
  jerseyNumber,
  x,
  y,
  teamSide,
  onSelect,
  isSetter,
  isLibero,
  isSelectedForTouch,
  isAwaitingSelection,
  isDisabled,
  replacingPlayerLabel,
  isSideline,
  onDropOnPlayer,
}: PlayerMarkerProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onDropOnPlayer || isDisabled || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = event.clientX - drag.startX;
    const y = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(x, y) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setDragOffset({ x, y });
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragOffset(null);
    if (!drag.moved || event.type === 'pointercancel') return;

    // A drag never counts as a tap, even when dropped on nothing.
    suppressClickRef.current = true;
    const target = document.elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-player-id]'))
      .find((element) => element && element !== event.currentTarget && element.dataset.teamSide === teamSide);
    const targetPlayerId = target?.dataset.playerId;
    if (targetPlayerId) {
      onDropOnPlayer?.(playerId, teamSide, targetPlayerId);
    }
  };

  const ariaLabel = replacingPlayerLabel
    ? `${teamSide} ${jerseyNumber}. ${replacingPlayerLabel}`
    : `${teamSide} ${jerseyNumber}`;

  return (
    <button
      type="button"
      className={`scouting-court__marker scouting-court__marker--${teamSide}${
        isSetter ? ' is-setter' : ''
      }${
        isLibero ? ' is-libero' : ''
      }${
        isSelectedForTouch ? ' is-selected-for-touch' : ''
      }${
        isAwaitingSelection ? ' is-awaiting-receiver-selection' : ''
      }${
        isDisabled ? ' is-disabled' : ''
      }${
        isSideline ? ' is-sideline' : ''
      }${
        dragOffset ? ' is-dragging' : ''
      }`}
      style={{
        ...createMarkerPositionStyle({ x, y }),
        ...(dragOffset ? { translate: `${dragOffset.x}px ${dragOffset.y}px` } : {}),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (!isDisabled) {
          onSelect?.(playerId, teamSide);
        }
      }}
      disabled={isDisabled}
      data-player-id={playerId}
      data-team-side={teamSide}
      aria-label={ariaLabel}
      aria-pressed={Boolean(isSelectedForTouch)}
      title={replacingPlayerLabel}
    >
      <span className="scouting-court__marker-number">
        {jerseyNumber}
        {isLibero ? (
          <span className="scouting-court__marker-libero-badge" aria-hidden="true">L</span>
        ) : null}
      </span>
      <span className="scouting-court__marker-dot" aria-hidden="true" />
    </button>
  );
}
