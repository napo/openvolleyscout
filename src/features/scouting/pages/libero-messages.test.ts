// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createLiberoMessages,
  getLiberoProposalPriority,
  getManageActionEventLabel,
} from './libero-messages';

const t = ((key: string, params?: Record<string, string | number>) => (
  params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key
)) as never;
const label = (teamSide: string, playerId: string) => `${teamSide}:${playerId}`;
const messages = createLiberoMessages(t, label);
const proposal = (overrides: Record<string, unknown>) => ({
  teamSide: 'home', playerOutId: 'out', playerInId: 'in', liberoPlayerId: 'lib', replacedPlayerId: 'mb',
  action: 'libero_enters', reason: 'auto_entry', ...overrides,
}) as never;

describe('libero messages', () => {
  it('labels a proposal with out/in players, or "not specified" without one', () => {
    expect(messages.getLiberoProposalLabel(null)).toBe('notSpecified');
    expect(messages.getLiberoProposalLabel(proposal({}))).toBe('home:out playerOut, home:in playerIn'.replace('playerOut', 'playerout').replace('playerIn', 'playerin'));
  });

  it('picks the message by proposal reason and action', () => {
    expect(messages.getAutomaticLiberoProposalMessage(proposal({ reason: 'front_row_exit' }))).toBe('liberoMustLeaveFrontRow(player=home:mb)');
    expect(messages.getAutomaticLiberoProposalMessage(proposal({ reason: 'service_exit' }))).toBe('liberoIllegalServe');
    expect(messages.getAutomaticLiberoProposalMessage(proposal({}))).toBe('liberoEntryProposal(libero=home:lib,player=home:mb)');
    expect(messages.getLiberoEntryProposalMessage(proposal({ action: 'second_libero_enters' }))).toBe('liberoSwapProposal');
  });

  it('maps touch violations, falling back to "too soon"', () => {
    expect(messages.getLiberoTouchViolationMessage('libero_illegal_block')).toBe('liberoIllegalBlock');
    expect(messages.getLiberoTouchViolationMessage('libero_illegal_attack')).toBe('liberoIllegalAttack');
    expect(messages.getLiberoTouchViolationMessage(undefined)).toBe('liberoReplacementTooSoon');
  });

  it('picks the confirm label', () => {
    expect(messages.getLiberoConfirmLabel(proposal({ reason: 'front_row_exit' }))).toBe('confirmLiberoExit');
    expect(messages.getLiberoConfirmLabel(proposal({ action: 'libero_enters' }))).toBe('confirmLiberoEntry');
    expect(messages.getLiberoConfirmLabel(null)).toBe('confirmLiberoReplacement');
  });

  it('announces only a libero that entered at rally 1', () => {
    const lineup = (state: unknown) => ({ personnelState: { activeLiberoState: state } });
    const match = {
      homeActiveLineup: lineup({ enteredAtRallyNumber: 1, liberoPlayerId: 'l1', replacedPlayerId: 'r1' }),
      awayActiveLineup: lineup({ enteredAtRallyNumber: 4, liberoPlayerId: 'l2', replacedPlayerId: 'r2' }),
    } as never;
    expect(messages.getInitialLiberoEntryMessages(match)).toEqual(['liberoEntryProposal(libero=home:l1,player=home:r1)']);
    expect(messages.getInitialLiberoEntryMessages(null)).toEqual([]);
  });
});

describe('priority and event labels', () => {
  it('orders front-row exits before entries', () => {
    expect(getLiberoProposalPriority(proposal({ reason: 'front_row_exit' }))).toBe(0);
    expect(getLiberoProposalPriority(proposal({}))).toBe(1);
  });

  it('labels manage-action events with a generic fallback', () => {
    expect(getManageActionEventLabel(t, 'timeout')).toBe('timeout');
    expect(getManageActionEventLabel(t, 'libero_replacement')).toBe('liberoReplacement');
    expect(getManageActionEventLabel(t, 'something_else' as never)).toBe('manageAction');
  });
});
