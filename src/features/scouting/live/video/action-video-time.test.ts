// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { resolveActionVideoSeconds } from './action-video-time';

describe('resolveActionVideoSeconds', () => {
  it('uses the moment the scout started entering the action', () => {
    expect(resolveActionVideoSeconds(120, 124.5)).toBe(120);
  });
  it('falls back to the current position without a usable start', () => {
    expect(resolveActionVideoSeconds(null, 124.5)).toBe(124.5);
    expect(resolveActionVideoSeconds(130, 124.5)).toBe(124.5); // video moved back
    expect(resolveActionVideoSeconds(100, 124.5)).toBe(124.5); // stale tap
  });
});
