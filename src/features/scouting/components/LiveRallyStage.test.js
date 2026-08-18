import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const liveRallyStagePath = join(__dirname, 'LiveRallyStage.tsx');
const scoutingCourtPath = join(__dirname, 'ScoutingCourt.tsx');
const playerMarkerPath = join(__dirname, 'PlayerMarker.tsx');
const ballTokenPath = join(__dirname, 'BallToken.tsx');
const courtBallDragPath = join(__dirname, '..', 'hooks', 'useCourtBallDrag.ts');
const appRouterPath = join(__dirname, '..', '..', '..', 'app', 'router', 'AppRouter.tsx');
const devSmokePagePath = join(__dirname, '..', 'pages', 'DevLiveScoutingSmokePage.tsx');
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

function getCssRule(source, selector, { fromEnd = false } = {}) {
  const start = fromEnd
    ? source.lastIndexOf(`${selector} {`)
    : source.indexOf(`${selector} {`);
  assert(start >= 0, `Expected CSS selector to exist: ${selector}`);
  const end = source.indexOf('\n}', start);
  assert(end >= 0, `Expected CSS selector to close: ${selector}`);
  return source.slice(start, end + 2);
}

describe('LiveRallyStage court-side rendering', () => {
  it('recomputes tactical players when display side changes', async () => {
    const source = await readFile(liveRallyStagePath, 'utf8');
    const awayDependencies = getUseMemoDependencyBlock(source, 'awayPlayersBase');
    const homeDependencies = getUseMemoDependencyBlock(source, 'homePlayersBase');

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

  it('renders only the latest trajectory, replacing previous arrows on a new drag', async () => {
    const source = await readFile(scoutingCourtPath, 'utf8');

    assert(source.includes('if (activeDragTrajectory)'));
    assert(source.includes('return [activeDragTrajectory];'));
    assert(source.includes('if (pendingTrajectory)'));
    assert(source.includes('return [pendingTrajectory];'));
    assert(source.includes('const latestCommittedTrajectory = trajectories.at(-1);'));
    assert(!source.includes('visualCommittedTrajectories'));
    assert(!source.includes('mergeTrajectoriesById'));
  });

  it('clears all arrows when the rally/action trajectory scope is empty', async () => {
    const source = await readFile(scoutingCourtPath, 'utf8');

    assert(source.includes('return latestCommittedTrajectory ? [latestCommittedTrajectory] : [];'));
  });

  it('defines concise live messages for receiver, serve error, and six-player warning states', async () => {
    const source = await readFile(liveRallyStagePath, 'utf8');

    assert(source.includes('receiverSelectedLiveMessage'));
    assert(source.includes('dragTowardReceivingArea'));
    assert(source.includes('serveOutNetConfirmationLiveMessage'));
    assert(source.includes('expectedSixPlayersPerTeamWarning'));
  });

  it('routes simple blocked attacks through opponent blocker selection', async () => {
    const stageSource = await readFile(liveRallyStagePath, 'utf8');
    const courtSource = await readFile(scoutingCourtPath, 'utf8');

    assert(stageSource.includes('flow.blockerSelection'));
    assert(stageSource.includes("t('selectOpponentBlocker')"));
    assert(stageSource.includes('selectablePlayerKeys={flow.selectableBlockerPlayerKeys}'));
    // Ball stays draggable during blocker selection only while the block
    // deflection segment can still be drawn from the net contact.
    assert(stageSource.includes('!flow.aceVictimSelection && (!flow.blockerSelection || quickAttackOnNet)'));
    assert(courtSource.includes('selectablePlayerKeys?: readonly string[] | null;'));
    assert(courtSource.includes('selectablePlayerKeySet !== null && !selectablePlayerKeySet.has(playerKey)'));
  });

  it('supports player-first attack selection: ball drag stays enabled and the opponent is disabled while attacking', async () => {
    const stageSource = await readFile(liveRallyStagePath, 'utf8');
    const storeSource = await readFile(
      join(__dirname, '..', 'live', 'stores', 'quick-scout-flow-store.ts'),
      'utf8',
    );

    // Tapping an attacker with the ball free (play_ready) enters the new
    // player-first phase and moves the ball onto them.
    assert(storeSource.includes("if (phase === 'play_ready' && teamSide === possessionTeam) {"));
    assert(storeSource.includes("setPhase('attack_player_selected');"));
    // A tap in the attacker's own court redefines the start point instead of
    // committing; a tap in the opponent's court (or the net) commits, reusing
    // the same outcome resolution as the trajectory-first path.
    assert(storeSource.includes("if (phase === 'attack_player_selected' && selectedPlayerId && selectedTeamSide) {"));
    assert(storeSource.includes('resolveAttackTouchOutcome(lockedTouch, attackingTeam);'));
    assert(stageSource.includes("if (qPhase === 'attack_player_selected') return t('quickDragAttackToLandingZone');"));
    // The opponent team is disabled (not just ignored) while the attacker is
    // being repositioned or the trajectory is being drawn.
    assert(stageSource.includes("quickFlow.phase === 'attack_player_selected' && flow.liveInputState.selectedTeamSide"));
  });

  it('drops the ball token pointer-events while it cannot be dragged, so a marker or zone underneath still receives the tap', async () => {
    const ballTokenSource = await readFile(ballTokenPath, 'utf8');
    const courtSource = await readFile(scoutingCourtPath, 'utf8');
    const cssSource = await readFile(cssPath, 'utf8');

    // The ball routinely rests exactly on a player's marker between touches
    // (z-index 8, above markers' z-index 4) — without this, a tap meant for
    // that marker (e.g. selecting the receiver right where the serve landed)
    // is silently swallowed by the ball's own hit area instead.
    assert(ballTokenSource.includes("isInteractive ? '' : 'is-not-interactive'"));
    assert(courtSource.includes('isInteractive={isBallDraggable}'));
    const rule = getCssRule(cssSource, '.scouting-court__ball-token.is-not-interactive');
    assert(rule.includes('pointer-events: none'));
  });

  it('suggests the attack ball type from reception quality until the scout picks one manually', async () => {
    const stageSource = await readFile(liveRallyStagePath, 'utf8');
    const rallyFlowSource = await readFile(
      join(__dirname, '..', 'live', 'rally', 'rally-flow.ts'),
      'utf8',
    );

    assert(rallyFlowSource.includes('export function suggestAttackBallTypeFromReception('));
    assert(stageSource.includes('suggestAttackBallTypeFromReception(currentRallyTouches.at(-1))'));
    // A manual toolbar pick wins over the suggestion until the flow returns to the
    // neutral play_ready state, where the override is cleared for the next attack.
    assert(stageSource.includes('setManualBallTypeOverride(true);'));
    assert(stageSource.includes("if (quickFlow.phase === 'play_ready') {\n      setManualBallTypeOverride(false);"));
  });

  it('allocates the live rally grid to court first and keeps overlay messages out of layout', async () => {
    const css = await readFile(cssPath, 'utf8');
    const liveStageRule = getCssRule(css, '.live-rally-stage', { fromEnd: true });
    const liveBodyStageRule = getCssRule(css, '.scouting-stage__body--live-rally .live-rally-stage', { fromEnd: true });
    const suggestionRule = getCssRule(css, '.live-rally-stage__suggestion');

    assert(liveStageRule.includes('grid-template-rows: minmax(0, 1fr) auto;'));
    assert(liveBodyStageRule.includes('grid-template-rows: minmax(0, 1fr) auto;'));
    assert(suggestionRule.includes('position: absolute;'));
    assert(suggestionRule.includes('z-index: 20;'));
  });

  it('declares live court-first sizing variables and caps the top control strip', async () => {
    const css = await readFile(cssPath, 'utf8');
    const liveScreenRule = getCssRule(css, '.scouting-screen--fixed:has(.scouting-stage__body--live-rally)');
    const liveContainerRule = getCssRule(css, '.scouting-screen--fixed:has(.scouting-stage__body--live-rally) .scouting-screen__container--fixed');
    const liveHeaderRule = getCssRule(css, '.scouting-screen--fixed:has(.scouting-stage__body--live-rally) .scouting-screen__header--operational');

    assert(liveScreenRule.includes('--live-top-height:'));
    assert(liveScreenRule.includes('--live-court-max-height: 100%;'));
    assert(liveScreenRule.includes('--live-toolbar-height: calc(2.08rem * var(--live-toolbar-scale, 1));'));
    assert(liveScreenRule.includes('--live-ball-size: 1.98rem;'));
    assert(liveScreenRule.includes('--live-marker-size: var(--live-ball-size);'));
    assert(liveScreenRule.includes('--live-marker-hit-size: 2.65rem;'));
    assert(liveScreenRule.includes('--live-stage-gap: 0.08rem;'));
    assert(liveContainerRule.includes('grid-template-rows: minmax(0, var(--live-top-height)) minmax(0, 1fr);'));
    assert(liveHeaderRule.includes('height: var(--live-top-height);'));
    assert(liveHeaderRule.includes('overflow: hidden;'));
  });

  it('sizes the court from the available stage cell instead of viewport height', async () => {
    const css = await readFile(cssPath, 'utf8');
    const courtRule = getCssRule(css, '.scouting-court');
    const liveCourtRule = getCssRule(css, '.scouting-stage__body--live-rally .scouting-court');
    const liveCourtSurfaceRule = getCssRule(css, '.scouting-stage__body--live-rally .scouting-court__surface');

    assert(courtRule.includes('container-type: size;'));
    assert(liveCourtRule.includes('min-width: 0;'));
    assert(liveCourtRule.includes('min-height: 0;'));
    assert(liveCourtRule.includes('max-height: var(--live-court-max-height, 100%);'));
    assert(liveCourtSurfaceRule.includes('width: 100%;'));
    assert(liveCourtSurfaceRule.includes('max-height: var(--live-court-max-height, 100%);'));
    assert(css.includes('width: min(100cqw, 200cqh);'));
    assert(css.includes('height: min(100cqh, 50cqw);'));
    assert(!liveCourtSurfaceRule.includes('100dvh'), 'Live court surface must not size itself from viewport height');
  });

  it('keeps the toolbar compact enough for court-first layout while allowing wrapping when needed', async () => {
    const css = await readFile(cssPath, 'utf8');
    const liveStageRule = getCssRule(css, '.live-rally-stage');
    const toolbarRule = getCssRule(css, '.live-scouting-toolbar', { fromEnd: true });
    const toolbarGroupRule = getCssRule(css, '.live-scouting-toolbar__group', { fromEnd: true });

    assert(liveStageRule.includes('gap: var(--live-stage-gap);'));
    assert(toolbarRule.includes('height: auto;'));
    assert(toolbarRule.includes('overflow: visible;'));
    assert(toolbarGroupRule.includes('flex-wrap: wrap;'));
  });

  it('applies compact live marker sizing while keeping an expanded hit target', async () => {
    const css = await readFile(cssPath, 'utf8');
    const liveStageRule = getCssRule(css, '.live-rally-stage');
    const markerHitRule = getCssRule(css, '.scouting-court__marker::before');
    const liveMarkerRule = getCssRule(css, '.scouting-stage__body--live-rally .scouting-court__marker-number');
    const liveMarkerDotRule = getCssRule(css, '.scouting-stage__body--live-rally .scouting-court__marker-dot');

    assert(liveStageRule.includes('--live-ball-size: 1.98rem;'));
    assert(liveStageRule.includes('--live-marker-size: var(--live-ball-size);'));
    assert(liveStageRule.includes('--live-marker-scale: 1;'));
    assert(liveStageRule.includes('--live-marker-hit-size: 2.65rem;'));
    assert(liveStageRule.includes('--live-marker-number-width: var(--live-marker-size);'));
    assert(liveStageRule.includes('--live-marker-number-height: var(--live-marker-size);'));
    assert(liveStageRule.includes('--live-marker-font-size: 0.74rem;'));
    assert(markerHitRule.includes('width: var(--live-marker-hit-size, 2.45rem);'));
    assert(markerHitRule.includes('height: var(--live-marker-hit-size, 2.45rem);'));
    assert(liveMarkerRule.includes('width: var(--live-marker-size);'));
    assert(liveMarkerRule.includes('height: var(--live-marker-size);'));
    assert(liveMarkerDotRule.includes('display: none;'));
  });

  it('keeps the trajectory layer absolute and above markers and ball tokens', async () => {
    const css = await readFile(cssPath, 'utf8');
    const overlayRule = getCssRule(css, '.scouting-court__trajectory-overlay', { fromEnd: true });
    const markerRule = getCssRule(css, '.scouting-court__marker');
    const ballRule = getCssRule(css, '.scouting-court__ball-token');
    const pathRule = getCssRule(css, '.scouting-court__trajectory-path');

    assert(overlayRule.includes('z-index: 9;'));
    assert(markerRule.includes('z-index: 4;'));
    assert(ballRule.includes('z-index: 8;'));
    assert(pathRule.includes('--trajectory-dash-array: 7 5;'));
    assert(pathRule.includes('opacity: max(var(--trajectory-opacity), 0.82);'));
  });

  it('renders and styles a distinct libero marker badge without removing setter or selection rings', async () => {
    const markerSource = await readFile(playerMarkerPath, 'utf8');
    const css = await readFile(cssPath, 'utf8');
    const liberoRule = getCssRule(css, '.scouting-court__marker.is-libero');
    const liberoNumberRule = getCssRule(css, '.scouting-court__marker.is-libero .scouting-court__marker-number');
    const badgeRule = getCssRule(css, '.scouting-court__marker-libero-badge');

    assert(markerSource.includes('scouting-court__marker-libero-badge'));
    assert(markerSource.includes('aria-hidden="true">L</span>'));
    assert(liberoRule.includes('--marker-libero-ring: 0 0 0 2px var(--marker-libero-ring-color);'));
    assert(liberoNumberRule.includes('var(--marker-setter-ring)'));
    assert(liberoNumberRule.includes('var(--marker-selection-ring)'));
    assert(badgeRule.includes('background: #020617;'));
    assert(badgeRule.includes('font-weight: 900;'));
  });

  it('starts drag direction at the rendered ball center and records a non-zero visible vector', async () => {
    const source = await readFile(courtBallDragPath, 'utf8');

    assert(source.includes('getElementCenterClientPoint(event.currentTarget)'));
    assert(source.includes('const pointerPoint = stageElement'));
    assert(source.includes('updateBallDragDirectionEnd('));
    assert(source.includes('ball_drag_start'));
    assert(source.includes('zero_length_drag_direction'));
  });

  it('keeps ball-drag pointer capture orientation-aware while zone-snap logic stays canonical', async () => {
    const dragSource = await readFile(courtBallDragPath, 'utf8');
    const courtSource = await readFile(scoutingCourtPath, 'utf8');

    assert(dragSource.includes('function toCanonicalStagePoint('));
    assert(dragSource.includes('getRelativeTacticalViewportPoint(event, stageElement, orientation)'));
    assert(dragSource.includes("orientation = 'horizontal',"));
    // Zone-containment checks must keep reading canonical (unswapped) points.
    assert(dragSource.includes('point.x >= zone.bounds.x'));

    assert(courtSource.includes("orientation = 'horizontal',"));
    assert(courtSource.includes('getDisplayScoutingBounds(zone.bounds, orientation)'));
    // The canonical zone (not the display-transformed bounds) must still drive the click handler.
    assert(courtSource.includes('onClick={() => snapToZone(zone)}'));
  });

  it('has a hidden dev smoke route with a real seeded live rally stage', async () => {
    const routerSource = await readFile(appRouterPath, 'utf8');
    const smokeSource = await readFile(devSmokePagePath, 'utf8');

    assert(routerSource.includes('import.meta.env.DEV'));
    assert(routerSource.includes('/dev/live-scouting-smoke'));
    assert(smokeSource.includes('<LiveRallyStage'));
    assert(smokeSource.includes('Array.from({ length: 6 }'));
    assert(smokeSource.includes('6 + 6 players'));
  });
});
