// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';
import type { AttackSubtype } from '@src/domain/touch/types';

/**
 * Hard / placed / tip for the next attack in Court and Expert input, chosen
 * on the toolbar before the attack is drawn. Hard by default (as in
 * DataVolley); it goes back to hard once an attack is recorded.
 */
interface AttackSubtypeState {
  next: AttackSubtype;
  setNext: (subtype: AttackSubtype) => void;
  /** The subtype for the attack being recorded; resets to hard. */
  take: () => AttackSubtype;
}

export const useAttackSubtypeStore = create<AttackSubtypeState>((set, get) => ({
  next: 'H',
  setNext: (next) => set({ next }),
  take: () => {
    const value = get().next;
    if (value !== 'H') set({ next: 'H' });
    return value;
  },
}));
