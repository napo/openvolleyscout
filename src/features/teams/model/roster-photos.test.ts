// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { mergedTeamPhotoChanges, orphanedPhotoIds, rosterPhotoChanges } from './roster-photos';

const P1 = 'data:image/png;base64,P1';
const P2 = 'data:image/jpeg;base64,P2';

describe('photo changes of a roster', () => {
  it('writes the photos chosen or removed for the athletes on the roster, and removes those of the athletes taken off it', () => {
    const pending = new Map<string, string | null>([['a', P1], ['b', null], ['gone', P2]]);
    expect(rosterPhotoChanges(pending, ['a', 'b', 'c', 'gone'], ['a', 'b', 'c', 'new'])).toEqual(
      new Map<string, string | null>([['a', P1], ['b', null], ['gone', null]]),
    );
  });

  it('writes nothing when nothing changed', () => {
    expect(rosterPhotoChanges(new Map(), ['a', 'b'], ['b', 'a']).size).toBe(0);
  });

  it('a new athlete added and given a photo in the same edit gets it', () => {
    expect(rosterPhotoChanges(new Map([['new', P1]]), [], ['new'])).toEqual(new Map([['new', P1]]));
  });
});

describe('photos of deleted teams', () => {
  it('removes only the photos of athletes on no roster left', () => {
    expect(orphanedPhotoIds(['a', 'b', 'a', ''], ['b', 'x'])).toEqual(['a']);
  });
});

describe('photos of merged teams', () => {
  it('moves a photo to the kept athlete only when she has none, and drops the discarded one', () => {
    const remap = new Map([['d1', 'k1'], ['d2', 'k2'], ['d3', 'k3']]);
    const photos = new Map([['d1', P1], ['d2', P2], ['k2', P1]]);
    expect(mergedTeamPhotoChanges(remap, photos)).toEqual(
      new Map<string, string | null>([['k1', P1], ['d1', null], ['d2', null]]),
    );
  });

  it('two discarded athletes merged into one: the first photo wins', () => {
    const remap = new Map([['d1', 'k1'], ['d2', 'k1']]);
    expect(mergedTeamPhotoChanges(remap, new Map([['d1', P1], ['d2', P2]]))).toEqual(
      new Map<string, string | null>([['k1', P1], ['d1', null], ['d2', null]]),
    );
  });
});
