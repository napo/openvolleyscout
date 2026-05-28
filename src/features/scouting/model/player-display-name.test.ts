import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getPlayerDisplayName } from '../../../domain/roster/helpers.ts';

describe('getPlayerDisplayName', () => {
  it('returns displayName when provided', () => {
    const player = {
      id: 'p1',
      jerseyNumber: 1,
      firstName: 'Gigi',
      lastName: 'Rossi',
      shortName: 'G. Rossi',
      displayName: 'Gigi',
      playerCode: 'GR',
    };

    assert.equal(getPlayerDisplayName(player), 'Gigi');
  });

  it('falls back to shortName when displayName is missing', () => {
    const player = {
      id: 'p1',
      jerseyNumber: 1,
      firstName: 'Gigi',
      lastName: 'Rossi',
      shortName: 'G. Rossi',
      playerCode: 'GR',
    };

    assert.equal(getPlayerDisplayName(player), 'G. Rossi');
  });

  it('falls back to first and last name when no displayName or shortName is present', () => {
    const player = {
      id: 'p1',
      jerseyNumber: 1,
      firstName: 'Gigi',
      lastName: 'Rossi',
      shortName: '',
      playerCode: 'GR',
    };

    assert.equal(getPlayerDisplayName(player), 'Gigi Rossi');
  });

  it('falls back to playerCode when only playerCode is available', () => {
    const player = {
      id: 'p1',
      jerseyNumber: 1,
      firstName: '',
      lastName: '',
      shortName: '',
      playerCode: 'GR',
    };

    assert.equal(getPlayerDisplayName(player), 'GR');
  });

  it('returns empty string for missing player', () => {
    assert.equal(getPlayerDisplayName(null), '');
  });
});
