// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { RECEIVE_TO_SERVE_EVALUATION, SERVE_TO_RECEIVE_EVALUATION } from './datavolley-flow';

describe('serve rating when only the serving team is scouted', () => {
  it('maps every serve that reaches the opponent back to the same compound code', () => {
    for (const [serve, receive] of Object.entries(SERVE_TO_RECEIVE_EVALUATION)) {
      expect(RECEIVE_TO_SERVE_EVALUATION[receive!]).toBe(serve);
    }
    expect(SERVE_TO_RECEIVE_EVALUATION['=']).toBeUndefined();
    expect(Object.keys(SERVE_TO_RECEIVE_EVALUATION).sort()).toEqual(['!', '#', '+', '-', '/']);
  });
});
