import type { TeamSide } from '@src/domain/common/enums';

export type PopupPlacementPoint = {
  x: number;
  y: number;
};

export type PopupPlacementRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type BallTouchPopupLayout = {
  left: number;
  top: number;
  maxHeight: number;
  compact: boolean;
};

export type BallTouchPopupPlacementInput = {
  surfaceWidth: number;
  surfaceHeight: number;
  popupWidth: number;
  popupHeight: number;
  teamSide: TeamSide;
  anchor: PopupPlacementPoint;
  ballPosition?: PopupPlacementPoint;
  ballRect?: PopupPlacementRect;
  avoidPoints?: PopupPlacementPoint[];
};

type LayoutCandidate = {
  left: number;
  top: number;
};

export const POPUP_AVOIDANCE_GAP = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createPopupPlacementRect(
  left: number,
  top: number,
  width: number,
  height: number,
): PopupPlacementRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

export function doPopupPlacementRectsOverlap(
  first: PopupPlacementRect,
  second: PopupPlacementRect,
  gap = 0,
): boolean {
  return !(
    first.right + gap <= second.left
    || first.left - gap >= second.right
    || first.bottom + gap <= second.top
    || first.top - gap >= second.bottom
  );
}

function getOverlapArea(first: PopupPlacementRect, second: PopupPlacementRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

  return width * height;
}

function getRectCenter(rect: PopupPlacementRect): PopupPlacementPoint {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function getFallbackBallRect(
  surfaceWidth: number,
  surfaceHeight: number,
  anchor: PopupPlacementPoint,
): PopupPlacementRect {
  const tokenSize = Math.max(28, Math.min(surfaceWidth, surfaceHeight) * 0.1);
  const centerX = (anchor.x / 100) * surfaceWidth;
  const centerY = (anchor.y / 100) * surfaceHeight;

  return createPopupPlacementRect(centerX - tokenSize / 2, centerY - tokenSize / 2, tokenSize, tokenSize);
}

function getPointRect(
  surfaceWidth: number,
  surfaceHeight: number,
  point: PopupPlacementPoint,
  size: number,
): PopupPlacementRect {
  const centerX = (point.x / 100) * surfaceWidth;
  const centerY = (point.y / 100) * surfaceHeight;

  return createPopupPlacementRect(centerX - size / 2, centerY - size / 2, size, size);
}

function doesOverlapAny(
  rect: PopupPlacementRect,
  avoidRects: readonly PopupPlacementRect[],
  gap = 0,
): boolean {
  return avoidRects.some((avoidRect) => doPopupPlacementRectsOverlap(rect, avoidRect, gap));
}

function getTotalOverlapArea(rect: PopupPlacementRect, avoidRects: readonly PopupPlacementRect[]): number {
  return avoidRects.reduce((total, avoidRect) => total + getOverlapArea(rect, avoidRect), 0);
}

function createOppositeCourtCandidate({
  ballRect,
  popupWidth,
  preferredTop,
  surfaceWidth,
  leftBound,
  rightBound,
}: {
  ballRect: PopupPlacementRect;
  popupWidth: number;
  preferredTop: number;
  surfaceWidth: number;
  leftBound: number;
  rightBound: number;
}): LayoutCandidate {
  const ballCenter = getRectCenter(ballRect);
  const oppositeLeft = ballCenter.x < surfaceWidth / 2
    ? Math.max(surfaceWidth * 0.58, ballRect.right + POPUP_AVOIDANCE_GAP)
    : Math.min(surfaceWidth * 0.42 - popupWidth, ballRect.left - popupWidth - POPUP_AVOIDANCE_GAP);

  return {
    left: clamp(oppositeLeft, leftBound, rightBound),
    top: preferredTop,
  };
}

function getCandidatesAwayFromBall({
  ballRect,
  anchorX,
  anchorY,
  popupWidth,
  popupHeight,
  preferredTop,
  surfaceWidth,
  horizontalGap,
  verticalGap,
  leftBound,
  rightBound,
  topBound,
  bottomBound,
  prefersRightHalf,
}: {
  ballRect: PopupPlacementRect;
  anchorX: number;
  anchorY: number;
  popupWidth: number;
  popupHeight: number;
  preferredTop: number;
  surfaceWidth: number;
  horizontalGap: number;
  verticalGap: number;
  leftBound: number;
  rightBound: number;
  topBound: number;
  bottomBound: number;
  prefersRightHalf: boolean;
}): LayoutCandidate[] {
  const ballCenter = getRectCenter(ballRect);
  const preferredSideLeft = prefersRightHalf
    ? Math.max(surfaceWidth * 0.58, anchorX + horizontalGap)
    : Math.min((surfaceWidth * 0.42) - popupWidth, anchorX - popupWidth - horizontalGap);
  const oppositeSideLeft = prefersRightHalf
    ? anchorX - popupWidth - horizontalGap
    : anchorX + horizontalGap;
  const centeredLeft = anchorX - popupWidth / 2;
  const awayFromBallLeft = ballCenter.x < surfaceWidth / 2
    ? ballRect.right + POPUP_AVOIDANCE_GAP
    : ballRect.left - popupWidth - POPUP_AVOIDANCE_GAP;
  const oppositeCourtCandidate = createOppositeCourtCandidate({
    ballRect,
    popupWidth,
    preferredTop,
    surfaceWidth,
    leftBound,
    rightBound,
  });

  return [
    oppositeCourtCandidate,
    { left: awayFromBallLeft, top: preferredTop },
    { left: preferredSideLeft, top: preferredTop },
    { left: oppositeSideLeft, top: preferredTop },
    { left: oppositeCourtCandidate.left, top: ballRect.top - popupHeight - verticalGap },
    { left: oppositeCourtCandidate.left, top: ballRect.bottom + verticalGap },
    { left: centeredLeft, top: anchorY - popupHeight - verticalGap },
    { left: centeredLeft, top: anchorY + verticalGap },
  ].map((candidate) => ({
    left: clamp(candidate.left, leftBound, rightBound),
    top: clamp(candidate.top, topBound, bottomBound),
  }));
}

export function computeBallTouchPopupLayout(input: BallTouchPopupPlacementInput): BallTouchPopupLayout {
  const isShortLandscapeSurface = input.surfaceHeight <= 320 && input.surfaceWidth > input.surfaceHeight;
  const padding = isShortLandscapeSurface ? 6 : input.surfaceHeight < 360 ? 8 : 12;
  const horizontalGap = isShortLandscapeSurface ? 6 : input.surfaceWidth < 640 ? 8 : 12;
  const anchorX = (input.anchor.x / 100) * input.surfaceWidth;
  const anchorY = (input.anchor.y / 100) * input.surfaceHeight;
  const availableHeight = Math.max(input.surfaceHeight - (padding * 2), 0);
  const maxHeight = isShortLandscapeSurface
    ? Math.min(availableHeight, input.surfaceHeight * 0.9)
    : availableHeight;
  const popupHeight = Math.min(input.popupHeight, maxHeight);
  const leftBound = padding;
  const rightBound = Math.max(padding, input.surfaceWidth - input.popupWidth - padding);
  const prefersRightHalf = input.teamSide === 'away' || input.anchor.x < 50;
  const preferredTop = anchorY - (popupHeight * 0.45);
  const verticalGap = horizontalGap;
  const topBound = padding;
  const bottomBound = Math.max(padding, input.surfaceHeight - popupHeight - padding);
  const ballAnchor = input.ballPosition ?? input.anchor;
  const ballRect = input.ballRect ?? getFallbackBallRect(input.surfaceWidth, input.surfaceHeight, ballAnchor);
  const avoidPointSize = Math.max(30, Math.min(input.surfaceWidth, input.surfaceHeight) * 0.11);
  const avoidRects = [
    ballRect,
    ...(input.avoidPoints ?? []).map((point) => getPointRect(
      input.surfaceWidth,
      input.surfaceHeight,
      point,
      avoidPointSize,
    )),
  ];
  const candidates = getCandidatesAwayFromBall({
    ballRect,
    anchorX,
    anchorY,
    popupWidth: input.popupWidth,
    popupHeight,
    preferredTop,
    surfaceWidth: input.surfaceWidth,
    horizontalGap,
    verticalGap,
    leftBound,
    rightBound,
    topBound,
    bottomBound,
    prefersRightHalf,
  });
  const fallbackLeft = prefersRightHalf ? rightBound : leftBound;
  const fallbackCandidate = {
    left: fallbackLeft,
    top: clamp(preferredTop, topBound, bottomBound),
  };
  const topFallbackCandidate = {
    left: clamp(anchorX - input.popupWidth / 2, leftBound, rightBound),
    top: topBound,
  };
  const bottomFallbackCandidate = {
    left: clamp(anchorX - input.popupWidth / 2, leftBound, rightBound),
    top: bottomBound,
  };
  const candidatePool = [
    ...candidates,
    fallbackCandidate,
    topFallbackCandidate,
    bottomFallbackCandidate,
  ];
  const bestCandidate = candidatePool.find((candidate) => (
    !doesOverlapAny(
      createPopupPlacementRect(candidate.left, candidate.top, input.popupWidth, popupHeight),
      avoidRects,
      POPUP_AVOIDANCE_GAP,
    )
  )) ?? candidatePool
    .sort((left, right) => (
      getTotalOverlapArea(createPopupPlacementRect(left.left, left.top, input.popupWidth, popupHeight), avoidRects)
      - getTotalOverlapArea(createPopupPlacementRect(right.left, right.top, input.popupWidth, popupHeight), avoidRects)
    ))[0] ?? fallbackCandidate;

  return {
    left: bestCandidate.left,
    top: bestCandidate.top,
    maxHeight,
    compact: isShortLandscapeSurface || maxHeight < 280,
  };
}
