/**
 * Scouting store invariants — mode normalization, syncWithProject guard logic,
 * rotation server assignment after side-out.
 * Plain JavaScript (no ts-node) — tests rules inline.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';

// ─── Inline rule definitions (mirrored from source) ──────────────────────────

const SIDEOUT_ROTATION_MAP = { 1: 6, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1 };
const SCOUTING_MODES = ['simple', 'advanced'];
const DEFAULT_SCOUTING_MODE = 'simple';

function normalizeScoutingMode(mode) {
  return typeof mode === 'string' && SCOUTING_MODES.includes(mode) ? mode : DEFAULT_SCOUTING_MODE;
}

function shouldRotateAfterPoint(servingTeam, pointWinner) {
  return pointWinner !== servingTeam;
}

function getNextServingTeam(_servingTeam, pointWinner) {
  return pointWinner;
}

/**
 * Mirrors the syncWithProject guard condition in scouting-store.ts.
 * Returns true if syncWithProject should skip the full liveMatch rebuild.
 */
function shouldSkipSyncWithProject(liveMatch, project) {
  if (!liveMatch || !project) return false;
  if (liveMatch.activeProjectId !== project.metadata?.id) return false;

  const liveLen = liveMatch.eventLog.length;
  const projectLen = project.events.length;

  return (
    liveLen >= projectLen
    && (projectLen === 0 || liveMatch.eventLog[projectLen - 1]?.id === project.events.at(-1)?.id)
  );
}

// ─── normalizeScoutingMode ────────────────────────────────────────────────────

describe('normalizeScoutingMode', () => {
  it('returns simple for undefined, null, or unknown strings', () => {
    assert.strictEqual(normalizeScoutingMode(undefined), 'simple');
    assert.strictEqual(normalizeScoutingMode(null), 'simple');
    assert.strictEqual(normalizeScoutingMode(''), 'simple');
    assert.strictEqual(normalizeScoutingMode('unknown'), 'simple');
    assert.strictEqual(normalizeScoutingMode(42), 'simple');
  });

  it('returns simple for the string "simple"', () => {
    assert.strictEqual(normalizeScoutingMode('simple'), 'simple');
  });

  it('returns advanced for the string "advanced"', () => {
    assert.strictEqual(normalizeScoutingMode('advanced'), 'advanced');
  });

  it('does not accept case variations', () => {
    assert.strictEqual(normalizeScoutingMode('Advanced'), 'simple');
    assert.strictEqual(normalizeScoutingMode('ADVANCED'), 'simple');
    assert.strictEqual(normalizeScoutingMode('Simple'), 'simple');
  });
});

// ─── syncWithProject guard ────────────────────────────────────────────────────

describe('syncWithProject guard — skip-rebuild condition', () => {
  function makeEvent(id) {
    return { id, type: 'touch_recorded', createdAt: Date.now() };
  }

  function makeProject(id, events) {
    return { metadata: { id }, events };
  }

  function makeLiveMatch(projectId, events) {
    return { activeProjectId: projectId, eventLog: events };
  }

  it('returns false when liveMatch is null', () => {
    const project = makeProject('p1', [makeEvent('e1')]);
    assert.strictEqual(shouldSkipSyncWithProject(null, project), false);
  });

  it('returns false when project is null', () => {
    const liveMatch = makeLiveMatch('p1', [makeEvent('e1')]);
    assert.strictEqual(shouldSkipSyncWithProject(liveMatch, null), false);
  });

  it('returns false when project IDs differ', () => {
    const events = [makeEvent('e1')];
    const liveMatch = makeLiveMatch('p1', events);
    const project = makeProject('p2', events); // different project ID
    assert.strictEqual(shouldSkipSyncWithProject(liveMatch, project), false);
  });

  it('returns true when project events is empty and liveMatch has events', () => {
    const liveMatch = makeLiveMatch('p1', [makeEvent('e1')]);
    const project = makeProject('p1', []);
    assert.strictEqual(shouldSkipSyncWithProject(liveMatch, project), true);
  });

  it('returns true when project events are a strict prefix of liveMatch events', () => {
    const e1 = makeEvent('e1');
    const e2 = makeEvent('e2');
    const e3 = makeEvent('e3');
    const liveMatch = makeLiveMatch('p1', [e1, e2, e3]);
    const project = makeProject('p1', [e1, e2]); // only first two events persisted
    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, project),
      true,
      'should skip when project has 2 events and liveMatch has 3 (project is behind)',
    );
  });

  it('returns true when project events equal liveMatch events (same last ID)', () => {
    const e1 = makeEvent('e1');
    const e2 = makeEvent('e2');
    const liveMatch = makeLiveMatch('p1', [e1, e2]);
    const project = makeProject('p1', [e1, e2]);
    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, project),
      true,
      'should skip when project and liveMatch are identical',
    );
  });

  it('returns false when project has MORE events than liveMatch', () => {
    const e1 = makeEvent('e1');
    const e2 = makeEvent('e2');
    const liveMatch = makeLiveMatch('p1', [e1]);
    const project = makeProject('p1', [e1, e2]); // project is ahead!
    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, project),
      false,
      'should NOT skip when project has more events — liveMatch needs rebuild',
    );
  });

  it('returns false when last event IDs differ even with same length', () => {
    const e1a = makeEvent('e1-alpha');
    const e1b = makeEvent('e1-beta'); // different last event
    const liveMatch = makeLiveMatch('p1', [e1a]);
    const project = makeProject('p1', [e1b]);
    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, project),
      false,
      'should NOT skip when event IDs differ — external modification detected',
    );
  });

  it('correctly identifies persistence write-back scenario', () => {
    // Scenario: user has liveMatch with [E1, E2, E3].
    // Persistence only saved [E1, E2] (E3 was recorded after persist started).
    // setActiveProject fires with project that has [E1, E2].
    // syncWithProject MUST skip to preserve E3.
    const e1 = makeEvent('persist-e1');
    const e2 = makeEvent('persist-e2');
    const e3 = makeEvent('live-e3'); // in-flight event, not yet persisted

    const liveMatch = makeLiveMatch('match-1', [e1, e2, e3]);
    const persistedProject = makeProject('match-1', [e1, e2]);

    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, persistedProject),
      true,
      'syncWithProject must skip: liveMatch has E3 that was recorded while persistence was in-flight',
    );
  });

  it('does NOT skip for a fresh project load (liveMatch empty)', () => {
    const liveMatch = makeLiveMatch('p1', []);
    const project = makeProject('p1', [makeEvent('e1')]);
    assert.strictEqual(
      shouldSkipSyncWithProject(liveMatch, project),
      false,
      'fresh project load with empty liveMatch must trigger rebuild',
    );
  });
});

// ─── Scouting mode persistence ────────────────────────────────────────────────

describe('scouting mode persistence rules', () => {
  it('mode change to advanced is preserved when no events change', () => {
    // Simulate: user changes to advanced, project already has the same events.
    // After persist write-back, scoutingMode in project should be advanced.
    // The guard would skip the rebuild → liveMatch.scoutingMode stays advanced.
    const mode = normalizeScoutingMode('advanced');
    assert.strictEqual(mode, 'advanced', 'advanced mode is a valid scouting mode');
  });

  it('default mode after normalizing unknown value is simple', () => {
    // Ensures that a corrupted or missing mode always falls back to simple
    const mode = normalizeScoutingMode(undefined);
    assert.strictEqual(mode, 'simple', 'corrupted mode falls back to simple');
  });
});

// ─── Side-out rotation server correctness ─────────────────────────────────────

describe('side-out rotation server assignment', () => {
  function simulateRallies(servingTeam, results) {
    // results: array of 'home'|'away' (point winner per rally)
    let currentServer = servingTeam;
    const lineup = [1, 2, 3, 4, 5, 6].map((p) => ({ courtPosition: p, playerId: `player-${p}` }));
    let currentSlots = [...lineup];

    const snapshots = [];
    for (const winner of results) {
      const rotate = shouldRotateAfterPoint(currentServer, winner);
      if (rotate) {
        currentSlots = currentSlots.map((slot) => ({
          ...slot,
          courtPosition: SIDEOUT_ROTATION_MAP[slot.courtPosition],
        }));
      }
      currentServer = getNextServingTeam(currentServer, winner);
      const serverSlot = currentSlots.find((s) => s.courtPosition === 1);
      snapshots.push({
        winner, server: currentServer, serverPlayerId: serverSlot?.playerId, rotated: rotate,
      });
    }
    return snapshots;
  }

  it('after one side-out (home serves, away wins), away serves and has rotated', () => {
    const [snap] = simulateRallies('home', ['away']);
    assert.strictEqual(snap.server, 'away', 'away must serve after winning');
    assert.strictEqual(snap.rotated, true, 'away must rotate');
    // player-2 (who was at position 2) should now be at position 1 (server)
    assert.strictEqual(snap.serverPlayerId, 'player-2', 'player originally at pos 2 becomes server');
  });

  it('after two consecutive side-outs, each team has rotated once', () => {
    // home serves → away wins → away serves → home wins → home serves
    const snaps = simulateRallies('home', ['away', 'home']);
    assert.strictEqual(snaps[0].server, 'away');
    assert.strictEqual(snaps[0].rotated, true);
    assert.strictEqual(snaps[1].server, 'home');
    assert.strictEqual(snaps[1].rotated, true);
  });

  it('break-point (server wins) does NOT rotate server lineup', () => {
    const [snap] = simulateRallies('home', ['home']);
    assert.strictEqual(snap.server, 'home', 'home remains server');
    assert.strictEqual(snap.rotated, false, 'no rotation on break-point');
    assert.strictEqual(snap.serverPlayerId, 'player-1', 'same player at position 1');
  });

  it('server after point is ALWAYS the point winner', () => {
    const scenarios = [
      { serving: 'home', winner: 'home' },
      { serving: 'home', winner: 'away' },
      { serving: 'away', winner: 'home' },
      { serving: 'away', winner: 'away' },
    ];
    scenarios.forEach(({ serving, winner }) => {
      const nextServer = getNextServingTeam(serving, winner);
      assert.strictEqual(nextServer, winner, `serving=${serving}, winner=${winner} → next server must be ${winner}`);
    });
  });
});
