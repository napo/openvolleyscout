import type { PointerEventHandler } from 'react';

interface BallTokenProps {
  x: number;
  y: number;
  isDragging?: boolean;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  ariaLabel: string;
}

export function BallToken({ x, y, isDragging = false, onPointerDown, ariaLabel }: BallTokenProps) {
  return (
    <button
      type="button"
      className={`scouting-court__ball-token${isDragging ? ' is-dragging' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onPointerDown={onPointerDown}
      aria-label={ariaLabel}
    >
      <span className="scouting-court__ball-core" />
      <span className="scouting-court__ball-panel scouting-court__ball-panel--left" />
      <span className="scouting-court__ball-panel scouting-court__ball-panel--right" />
      <span className="scouting-court__ball-panel scouting-court__ball-panel--top" />
    </button>
  );
}
