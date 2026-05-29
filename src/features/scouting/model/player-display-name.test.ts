import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getPlayerDisplayName } from '../../../domain/roster/helpers';

function makePlayer(overrides: Partial<{
  id: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  shortName: string;
  displayName: string;
  playerCode: string;
}>) {
  return {
    id: 'p1',
    jerseyNumber: 1,
    firstName: '',
    lastName: '',
    shortName: '',
    playerCode: '',
    ...overrides,
  };
}

describe('getPlayerDisplayName', () => {
  it('returns displayName when provided', () => {
    const player = makePlayer({ firstName: 'Gigi', lastName: 'Rossi', shortName: 'G. Rossi', displayName: 'Gigi' });
    assert.equal(getPlayerDisplayName(player), 'Gigi');
  });

  it('trims displayName', () => {
    const player = makePlayer({ displayName: '  Gigi  ' });
    assert.equal(getPlayerDisplayName(player), 'Gigi');
  });

  it('skips empty displayName and falls back to firstName + lastName', () => {
    const player = makePlayer({ firstName: 'Paola', lastName: 'Egonu', shortName: 'P. Egonu', displayName: '' });
    assert.equal(getPlayerDisplayName(player), 'Paola Egonu');
  });

  it('prefers firstName + lastName over shortName', () => {
    const player = makePlayer({ firstName: 'Paola', lastName: 'Egonu', shortName: 'P. Egonu' });
    assert.equal(getPlayerDisplayName(player), 'Paola Egonu');
  });

  it('returns only lastName when firstName is empty', () => {
    const player = makePlayer({ firstName: '', lastName: 'Egonu', shortName: '' });
    assert.equal(getPlayerDisplayName(player), 'Egonu');
  });

  it('returns only firstName when lastName is empty', () => {
    const player = makePlayer({ firstName: 'Paola', lastName: '', shortName: '' });
    assert.equal(getPlayerDisplayName(player), 'Paola');
  });

  it('falls back to shortName when firstName and lastName are both empty', () => {
    const player = makePlayer({ shortName: 'P. Egonu', playerCode: 'PEG' });
    assert.equal(getPlayerDisplayName(player), 'P. Egonu');
  });

  it('falls back to playerCode when no name fields are set', () => {
    const player = makePlayer({ playerCode: 'PEG' });
    assert.equal(getPlayerDisplayName(player), 'PEG');
  });

  it('returns empty string when all fields are missing', () => {
    const player = makePlayer({});
    assert.equal(getPlayerDisplayName(player), '');
  });

  it('returns empty string for null player', () => {
    assert.equal(getPlayerDisplayName(null), '');
  });

  it('returns empty string for undefined player', () => {
    assert.equal(getPlayerDisplayName(undefined), '');
  });

  it('does not return a corrupted shortName like ". Egonu" when firstName is empty', () => {
    // Regression: shortName auto-generated as ". Egonu" must not win
    const player = makePlayer({ firstName: '', lastName: 'Egonu', shortName: '. Egonu' });
    // fullName = 'Egonu' (lastName only) which is truthy → wins over shortName
    assert.equal(getPlayerDisplayName(player), 'Egonu');
  });

  // DataVolley import scenario: full name in firstName + lastName
  it('shows full imported DataVolley name in match report column', () => {
    const player = makePlayer({
      firstName: 'Paola',
      lastName: 'Egonu',
      shortName: 'P. Egonu',
      displayName: 'Paola Egonu',
    });
    // displayName wins (explicitly set by DataVolley import)
    assert.equal(getPlayerDisplayName(player), 'Paola Egonu');
  });

  it('shows firstName + lastName for DataVolley player with no explicit displayName on Team object', () => {
    // Simulates toTeamPlayer() dropping displayName (or it not being set)
    const player = makePlayer({
      firstName: 'Paola',
      lastName: 'Egonu',
      shortName: 'P. Egonu',
    });
    assert.equal(getPlayerDisplayName(player), 'Paola Egonu');
  });

  it('preserves manually edited displayName over firstName + lastName', () => {
    const player = makePlayer({
      firstName: 'Paola',
      lastName: 'Egonu',
      displayName: 'PaolaX',
    });
    assert.equal(getPlayerDisplayName(player), 'PaolaX');
  });
});

describe('dashboard player filter label format', () => {
  function filterLabel(jerseyNumber: number | string, playerName: string): string {
    return playerName ? `${jerseyNumber} - ${playerName}` : String(jerseyNumber);
  }

  it('shows "number - name" when name is available', () => {
    assert.equal(filterLabel(12, 'Paola Egonu'), '12 - Paola Egonu');
  });

  it('shows "number - name" for single name', () => {
    assert.equal(filterLabel(7, 'De Gennaro'), '7 - De Gennaro');
  });

  it('shows only jersey number when name is empty', () => {
    assert.equal(filterLabel(4, ''), '4');
  });

  it('separator appears only when name exists', () => {
    const withName = filterLabel(1, 'Egonu');
    const withoutName = filterLabel(1, '');
    assert.ok(withName.includes(' - '), 'separator should be present when name exists');
    assert.ok(!withoutName.includes(' - '), 'separator should be absent when name is missing');
  });
});
