import type { PointerEventHandler } from 'react';
import { VolleyballIcon } from './VolleyballIcon';

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
      <VolleyballIcon className="scouting-court__ball-icon" aria-hidden="true" focusable="false" />
    </button>
  );
}
