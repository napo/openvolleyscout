// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { describeImportError } from './LoadDataPage';

describe('describeImportError', () => {
  it('names the storage error so a failed import can be reported', () => {
    const quota = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
    expect(describeImportError(quota)).toBe(' (QuotaExceededError: The quota has been exceeded.)');
    expect(describeImportError(new Error('boom'))).toBe(' (boom)');
    expect(describeImportError('blocked')).toBe(' (blocked)');
    expect(describeImportError(undefined)).toBe('');
  });
});
