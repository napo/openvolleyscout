import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const liveRallyStagePath = join(__dirname, 'LiveRallyStage.tsx');
const scoutingCourtPath = join(__dirname, 'ScoutingCourt.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');

function getUseMemoDependencyBlock(source, memoName) {
  const memoStart = source.indexOf(`const ${memoName} = useMemo`);
  assert(memoStart >= 0, `Expected useMemo to exist: ${memoName}`);

  const dependencyStart = source.indexOf(')), [', memoStart);
  assert(dependencyStart >= 0, `Expected dependency array to exist: ${memoName}`);

  const dependencyEnd = source.indexOf(']);', dependencyStart);
  assert(dependencyEnd >= 0, `Expected dependency array to close: ${memoName}`);

  return source.slice(dependencyStart, dependencyEnd);
}

function getCssRule(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert(start >= 0, `Expected CSS selector to exist: ${selector}`);
  const end = source.indexOf('\n}', start);
  assert(end >= 0, `Expected CSS selector to close: ${selector}`);
  return source.slice(start, end + 2);
}

describe('LiveRallyStage court-side rendering', () => {
  it('recomputes tactical players when display side changes', async () => {
    const source = await readFile(liveRallyStagePath, 'utf8');
    const awayDependencies = getUseMemoDependencyBlock(source, 'awayPlayers');
    const homeDependencies = getUseMemoDependencyBlock(source, 'homePlayers');

    assert(awayDependencies.includes('awayDisplaySide'), 'awayPlayers must depend on awayDisplaySide');
    assert(homeDependencies.includes('homeDisplaySide'), 'homePlayers must depend on homeDisplaySide');
  });

  it('keeps marker movement transition on the shared marker class', async () => {
    const css = await readFile(cssPath, 'utf8');
    const markerRule = getCssRule(css, '.scouting-court__marker');

    assert(markerRule.includes('transition:'), 'Expected all team markers to share movement transitions');
    assert(markerRule.includes('left 230ms'), 'Expected left movement transition');
    assert(markerRule.includes('top 230ms'), 'Expected top movement transition');
    assert(markerRule.includes('transform 230ms'), 'Expected transform movement transition');
  });

  it('uses team-scoped player keys for court markers', async () => {
    const source = await readFile(scoutingCourtPath, 'utf8');

    assert(source.includes('getTeamScopedPlayerKey(teamSide, player.playerId)'));
  });

  it('defines concise live messages for receiver, serve error, and six-player warning states', async () => {
    const source = await readFile(liveRallyStagePath, 'utf8');

    assert(source.includes('receiverSelectedLiveMessage'));
    assert(source.includes('dragTowardReceivingArea'));
    assert(source.includes('serveOutNetConfirmationLiveMessage'));
    assert(source.includes('expectedSixPlayersPerTeamWarning'));
  });
});
