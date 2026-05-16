import type { CSSProperties } from 'react';

export type MarkerAnimationPoint = {
  x: number;
  y: number;
};

export const MARKER_TRANSITION_MS = 230;
export const BALL_TRANSITION_MS = 190;

export function createMarkerPositionStyle(point: MarkerAnimationPoint): CSSProperties {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    '--marker-x': point.x,
    '--marker-y': point.y,
  } as CSSProperties;
}

export function createBallPositionStyle(point: MarkerAnimationPoint): CSSProperties {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    '--ball-x': point.x,
    '--ball-y': point.y,
  } as CSSProperties;
}
