// SPDX-License-Identifier: AGPL-3.0-or-later

/** A start older than this is a tap that never became an action: ignore it. */
export const ACTION_START_MAX_AGE_SECONDS = 15;

/**
 * Video position of an action scouted with the video in the app: where the
 * video was when the scout started entering it, so the operator's typing time
 * is not added. Falls back to the current position when there is no start, or
 * when the start cannot belong to this action (the video was moved back, or
 * the start is too old).
 */
export function resolveActionVideoSeconds(startSeconds: number | null, nowSeconds: number): number {
  if (startSeconds === null || !Number.isFinite(startSeconds)) return nowSeconds;
  const elapsed = nowSeconds - startSeconds;
  return elapsed >= 0 && elapsed <= ACTION_START_MAX_AGE_SECONDS ? startSeconds : nowSeconds;
}
