import type { PointerEventHandler } from 'react';
import { VolleyballIcon } from './VolleyballIcon';
import { createBallPositionStyle } from '../live/animation/marker-animation';

interface BallTokenProps {
  x: number;
  y: number;
  isDragging?: boolean;
  /** False while the ball can't be grabbed (e.g. awaiting a player tap): the
   * token drops pointer-events so a marker or zone underneath it (the ball
   * routinely rests exactly on a player's position between touches) still
   * receives the tap instead of the ball silently swallowing it. */
  isInteractive?: boolean;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  ariaLabel: string;
}

export function BallToken({ x, y, isDragging = false, isInteractive = true, onPointerDown, ariaLabel }: BallTokenProps) {
  return (
    <button
      type="button"
      className={[
        'scouting-court__ball-token',
        isDragging ? 'is-dragging' : '',
        isInteractive ? '' : 'is-not-interactive',
      ].filter(Boolean).join(' ')}
      style={createBallPositionStyle({ x, y })}
      onPointerDown={onPointerDown}
      aria-label={ariaLabel}
      tabIndex={isInteractive ? undefined : -1}
    >
      <VolleyballIcon className="scouting-court__ball-icon" aria-hidden="true" focusable="false" />
    </button>
  );
}
