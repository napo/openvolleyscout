/**
 * Some exporters write a DVW where every scout row keeps the set-start
 * rotation: the setter zones (fields 10-11) and the six-player lineups
 * (fields 15-26) never rotate within a set, only substitutions change them.
 * Real DataVolley files rotate them on every side-out.
 *
 * When a team's setter zone is constant through a set although that team
 * sided out at least once, its rotation is rebuilt by replaying the rally
 * results: each side-out rotates the team that wins the serve (setter zone
 * z → z-1, 1 → 6; lineup slot i takes the player from slot i+1).
 */
import type { TeamSide } from '@src/domain/common/enums';
import type { ParsedImportWarning } from '../diagnostics';
import type { ParsedDataVolleyScoutRow } from './types';

const SIDES: readonly TeamSide[] = ['home', 'away'];

export function rotateSetterZone(zone: number, rotations: number): number {
  return ((((zone - 1 - rotations) % 6) + 6) % 6) + 1;
}

export function rotateLineup(lineup: readonly number[], rotations: number): number[] {
  if (lineup.length !== 6) return [...lineup];
  const shift = ((rotations % 6) + 6) % 6;
  return lineup.map((_, index) => lineup[(index + shift) % 6]);
}

const setterKey = (side: TeamSide): 'homeSetterPosition' | 'awaySetterPosition' => (side === 'home' ? 'homeSetterPosition' : 'awaySetterPosition');

/** Repairs, in place, sets whose rotation never advances. Returns the repaired (set, side) pairs. */
export function repairStaticRotations(rows: ParsedDataVolleyScoutRow[], warnings: ParsedImportWarning[]): Array<{ setNumber: number; side: TeamSide }> {
  const setNumbers = [...new Set(rows.map((row) => row.setNumber).filter((value): value is number => typeof value === 'number'))];
  const repaired: Array<{ setNumber: number; side: TeamSide }> = [];

  for (const setNumber of setNumbers) {
    const setRows = rows.filter((row) => row.setNumber === setNumber);
    // Rotation count of each team before every row, from serve and point rows.
    const rotations: Record<TeamSide, number> = { home: 0, away: 0 };
    const sideOuts: Record<TeamSide, number> = { home: 0, away: 0 };
    const rotationsAtRow = new Map<ParsedDataVolleyScoutRow, Record<TeamSide, number>>();
    let servingSide: TeamSide | null = null;
    for (const row of setRows) {
      rotationsAtRow.set(row, { ...rotations });
      if (row.type === 'touch' && row.skill === 'serve') servingSide = row.teamSide;
      if (row.type === 'point') {
        if (servingSide && row.pointWinnerSide !== servingSide) {
          rotations[row.pointWinnerSide] += 1;
          sideOuts[row.pointWinnerSide] += 1;
        }
        servingSide = row.pointWinnerSide;
      }
    }

    for (const side of SIDES) {
      const zones = new Set(setRows.map((row) => row.lineup?.[setterKey(side)]).filter((zone): zone is number => typeof zone === 'number' && zone >= 1 && zone <= 6));
      if (zones.size !== 1 || sideOuts[side] === 0) continue;
      const [startZone] = [...zones];
      for (const row of setRows) {
        const count = rotationsAtRow.get(row)?.[side] ?? 0;
        if (!row.lineup || count === 0) continue;
        row.lineup[setterKey(side)] = rotateSetterZone(startZone, count);
        row.lineup[side] = rotateLineup(row.lineup[side], count);
      }
      repaired.push({ setNumber, side });
      warnings.push({
        severity: 'info',
        code: `static-rotation-repaired:${setNumber}:${side}`,
        message: `Set ${setNumber}: the ${side} rotation never changed in the file; rebuilt from ${sideOuts[side]} side-outs.`,
      });
    }
  }
  return repaired;
}

/** Annotates every row with the setter declared by the latest "*P"/"aP" row of its set. */
export function annotateDeclaredSetters(rows: ParsedDataVolleyScoutRow[]): void {
  let currentSet: number | undefined;
  let declared: Record<TeamSide, number | undefined> = { home: undefined, away: undefined };
  for (const row of rows) {
    if (row.setNumber !== currentSet) {
      currentSet = row.setNumber;
      declared = { home: undefined, away: undefined };
    }
    if (row.type === 'setter_change') declared[row.teamSide] = row.setterNumber;
    // Set-start declarations ("*P14>LUp") are parsed as lineup rows: read the setter from the code.
    const lineupSetter = row.type === 'lineup' ? /^([*a])P(\d+)/.exec(row.rawCode) : null;
    if (lineupSetter) declared[lineupSetter[1] === '*' ? 'home' : 'away'] = Number(lineupSetter[2]);
    if (!row.lineup) continue;
    if (declared.home !== undefined) row.lineup.homeSetterNumber = declared.home;
    if (declared.away !== undefined) row.lineup.awaySetterNumber = declared.away;
  }
}
