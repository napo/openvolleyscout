import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEFAULT_DATAVOLLEY_CODE_TABLES, type DataVolleyCodeTables } from '@src/domain/match/code-tables';
import type { MatchProject } from '@src/domain/match/types';
import { exportMatchToDataVolley } from './index';

const ROOT = resolve(__dirname, '../../../..');
// Carries its own [3ATTACKCOMBINATION] / [3SETTERCALL] tables.
const WITH_TABLES = readFileSync(resolve(ROOT, 'docs/melodicspikers_hollywoodblockers.dvw'), 'latin1');
// Both tables are present but empty.
const WITHOUT_TABLES = readFileSync(resolve(ROOT, 'stuttgart-schwrein.dvw'), 'latin1');

function sectionRows(text: string, name: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`[${name}]`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && line.startsWith('['));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => line.length > 0);
}

function importProject(text: string): MatchProject {
  const parsed = parseDataVolleyFile(text, { sourceName: 'x.dvw' } as never);
  return mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'x.dvw' }).project;
}

function attackCodes(text: string): string[] {
  return sectionRows(text, '3SCOUT')
    .map((line) => line.split(';')[0])
    .filter((code) => /^[*a]\d{2}A/.test(code));
}

describe('DataVolley code tables', () => {
  it('writes the imported combinations and setter calls back unchanged', () => {
    const exported = exportMatchToDataVolley(importProject(WITH_TABLES)).text;

    expect(sectionRows(WITH_TABLES, '3ATTACKCOMBINATION').length).toBeGreaterThan(10);
    expect(sectionRows(exported, '3ATTACKCOMBINATION')).toEqual(sectionRows(WITH_TABLES, '3ATTACKCOMBINATION'));
    expect(sectionRows(exported, '3SETTERCALL')).toEqual(sectionRows(WITH_TABLES, '3SETTERCALL'));
  });

  it('keeps empty tables empty for a file that has none', () => {
    const project = importProject(WITHOUT_TABLES);
    expect(project.dataVolleyCodeTables).toEqual({ attackCombinations: [], setterCalls: [] });

    const exported = exportMatchToDataVolley(project).text;
    expect(sectionRows(exported, '3ATTACKCOMBINATION')).toEqual([]);
    expect(sectionRows(exported, '3SETTERCALL')).toEqual([]);
  });

  it('writes the standard DataVolley tables for a match without stored tables', () => {
    const project = importProject(WITH_TABLES);
    delete project.dataVolleyCodeTables;
    const exported = exportMatchToDataVolley(project).text;
    const tables: DataVolleyCodeTables = DEFAULT_DATAVOLLEY_CODE_TABLES;

    expect(sectionRows(exported, '3ATTACKCOMBINATION').map((row) => row.split(';')[0]))
      .toEqual(tables.attackCombinations.map((definition) => definition.code));
    expect(sectionRows(exported, '3SETTERCALL').map((row) => row.split(';')[0]))
      .toEqual(['K1', 'K7', 'K2', 'KF', 'KE']);
  });

  it('never writes a setter call into an attack code', () => {
    const project = importProject(WITH_TABLES);
    project.events.forEach((event) => {
      if (event.type === 'touch_recorded' && event.touch.skill === 'attack') {
        event.touch.combinationCode = 'K1';
      }
    });

    const codes = attackCodes(exportMatchToDataVolley(project).text);
    expect(codes.length).toBeGreaterThan(50);
    expect(codes.filter((code) => /^[*a]\d{2}A.{2}K/.test(code))).toEqual([]);
  });
});
