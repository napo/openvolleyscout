// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@src/i18n';
import { ScoutingTopBar, type ScoutingTopBarProps } from './ScoutingTopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderTopBar(overrides: Partial<ScoutingTopBarProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const props: ScoutingTopBarProps = {
    headerClassName: 'scouting-screen__header',
    matchbarClassName: 'scouting-screen__matchbar',
    leftTeam: {
      side: 'home',
      name: 'Aurora Volley',
      lineup: null,
      setsWon: 1,
      pointsScore: 14,
      timeouts: 1,
      substitutions: 2,
      canUndoPoint: true,
    },
    rightTeam: {
      side: 'away',
      name: 'Boreal Club',
      lineup: null,
      setsWon: 0,
      pointsScore: 11,
      timeouts: 0,
      substitutions: 1,
      canUndoPoint: false,
    },
    meta: {
      currentSetLabel: '2',
      currentRallyLabel: '25',
      servingTeamLabel: 'Aurora Volley',
      currentEventLabel: 'Rally active',
      homeTeamName: 'Aurora Volley',
      awayTeamName: 'Boreal Club',
      homeSetsWon: 1,
      awaySetsWon: 0,
      currentHomeScore: 14,
      currentAwayScore: 11,
    },
    activeStage: 'live_rally',
    isOperationalStage: true,
    canEditLiveScore: true,
    showSwapSides: true,
    inputLevel: 'court',
    simpleInput: false,
    dataVolleyRallyCode: '*04SM+',
    onManualPoint: vi.fn(),
    onUndoLastPoint: vi.fn(),
    onOpenManageAction: vi.fn(),
    onOpenManageActionFor: vi.fn(),
    onOpenExitDialog: vi.fn(),
    onSwapSides: vi.fn(),
    onOpenLiveHelp: vi.fn(),
    onSelectInputLevel: vi.fn(),
    ...overrides,
  };

  act(() => {
    root.render(
      <I18nProvider>
        <ScoutingTopBar {...props} />
      </I18nProvider>,
    );
  });

  return {
    container,
    props,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('ScoutingTopBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders teams, score, rally metadata, and DataVolley code, and triggers score/manage/input-mode handlers', () => {
    const { container, props, unmount } = renderTopBar();

    expect(container.textContent).toContain('Aurora Volley');
    expect(container.textContent).toContain('Boreal Club');
    expect(container.textContent).toContain('1-0');
    expect(container.textContent).toContain('14-11');
    expect(container.textContent).toContain('*04SM+');

    // Click +1 for home (left) and away (right).
    const addButtons = container.querySelectorAll<HTMLButtonElement>('.scouting-screen__score-button--add');
    expect(addButtons).toHaveLength(2);
    act(() => { addButtons[0].click(); });
    expect(props.onManualPoint).toHaveBeenCalledWith('home');
    act(() => { addButtons[1].click(); });
    expect(props.onManualPoint).toHaveBeenCalledWith('away');

    // Click undo on left (enabled) vs right (disabled).
    const undoButtons = container.querySelectorAll<HTMLButtonElement>('.scouting-screen__score-button--undo');
    expect(undoButtons[0].disabled).toBe(false);
    expect(undoButtons[1].disabled).toBe(true);
    act(() => { undoButtons[0].click(); });
    expect(props.onUndoLastPoint).toHaveBeenCalledWith('home');

    // Click Manage action button.
    const manageBtn = container.querySelector<HTMLButtonElement>('.scouting-screen__score-correction-button')!;
    act(() => { manageBtn.click(); });
    expect(props.onOpenManageAction).toHaveBeenCalledTimes(1);

    // Click swap sides button.
    act(() => { container.querySelector<HTMLButtonElement>('.scouting-screen__swap-sides-button')!.click(); });
    expect(props.onSwapSides).toHaveBeenCalledTimes(1);

    // Switch input mode to tag.
    const modeButtons = container.querySelectorAll<HTMLButtonElement>('.scouting-screen__input-mode-button');
    expect(modeButtons).toHaveLength(3);
    act(() => { modeButtons[0].click(); });
    expect(props.onSelectInputLevel).toHaveBeenCalledWith('tag');

    unmount();
  });
});
