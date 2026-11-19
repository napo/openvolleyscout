// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmAction } from './confirm-dialog';

describe('confirmAction without a mounted host', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('falls back to window.confirm', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    await expect(confirmAction('Sure?')).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith('Sure?');
  });

  it('resolves false when the user declines', async () => {
    vi.stubGlobal('window', { confirm: () => false });
    await expect(confirmAction('Sure?')).resolves.toBe(false);
  });
});
