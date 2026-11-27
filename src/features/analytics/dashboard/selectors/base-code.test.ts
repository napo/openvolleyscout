// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { sortBaseCodes } from './base-code';

describe('sortBaseCodes', () => {
  it('puts the bases (setter calls) first', () => {
    expect(sortBaseCodes(['X5', 'K9', 'C5', 'K2', 'K1', 'KC', 'X5'])).toEqual(['K1', 'K2', 'K9', 'KC', 'C5', 'X5']);
  });
});
