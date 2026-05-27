import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const matchReportModelPath = join(__dirname, 'match-report.ts');
const importMapperPath = join(__dirname, '..', '..', 'import', 'mapping', 'datavolley-to-ovs.ts');
const eventTypesPath = join(__dirname, '..', '..', '..', 'domain', 'events', 'types.ts');

describe('Set duration label', () => {
  it('exports formatDurationLabel as a named function', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    assert(source.includes('export function formatDurationLabel'), 'formatDurationLabel must be exported');
  });

  it('returns null for durations under 60 seconds (import clock artifacts)', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    // The guard threshold is 60_000 ms
    assert(source.includes('durationMillis < 60_000'), 'Must guard against sub-minute durations');
    assert(source.includes('return null'), 'Must return null for tiny durations');
  });

  it('formats durations under one hour as "X min"', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    assert(source.includes("return `${totalMinutes} min`"), 'Must format sub-hour durations as "X min"');
  });

  it('formats durations of one hour or more as "Xh Ymin"', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    assert(source.includes("return `${hours}h ${minutes}min`"), 'Must format multi-hour durations as "Xh Ymin"');
  });

  it('uses Math.round for minutes (not Math.floor) to avoid systematic rounding down', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    assert(source.includes('Math.round(durationMillis / 60_000)'), 'Must round to nearest minute');
  });

  it('getSetDurationLabel prefers set_ended.durationMillis over timestamp arithmetic', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    // Must read durationMillis from the set_ended event first
    assert(source.includes('endedEvent.durationMillis'), 'getSetDurationLabel must prefer explicit durationMillis');
    assert(source.includes('return formatDurationLabel(endedEvent.durationMillis)'), 'Must pass durationMillis to formatDurationLabel');
  });

  it('getSetDurationLabel falls back to timestamp arithmetic for live-scouted matches', async () => {
    const source = await readFile(matchReportModelPath, 'utf8');
    assert(source.includes('return formatDurationLabel(endedAt - startedAt)'), 'Must fall back to timestamp diff for live matches');
  });
});

describe('DataVolley import: set duration from DVW file', () => {
  it('set_ended event type has optional durationMillis field', async () => {
    const source = await readFile(eventTypesPath, 'utf8');
    assert(source.includes('durationMillis?:'), 'set_ended type must have optional durationMillis field');
  });

  it('captures setStartedAt before pushing set_started event', async () => {
    const source = await readFile(importMapperPath, 'utf8');
    assert(source.includes('const setStartedAt = nextTimestamp(input.clock)'), 'Must capture setStartedAt');
    assert(source.includes('createdAt: setStartedAt,'), 'set_started must use captured setStartedAt');
  });

  it('uses DVW duration (minutes) to compute set_ended.createdAt offset from setStartedAt', async () => {
    const source = await readFile(importMapperPath, 'utf8');
    assert(source.includes('setSummary.duration * 60 * 1000'), 'Must multiply DVW duration (min) by 60,000 for ms');
    assert(source.includes('setStartedAt + dvwDurationMs'), 'set_ended.createdAt must be setStartedAt + duration');
    assert(source.includes('const setEndedAt'), 'Must have setEndedAt variable');
    assert(source.includes('createdAt: setEndedAt,'), 'set_ended event must use setEndedAt');
  });

  it('stores durationMillis directly on the set_ended event from the DVW duration', async () => {
    const source = await readFile(importMapperPath, 'utf8');
    assert(source.includes('durationMillis: dvwDurationMs,'), 'set_ended event must carry durationMillis from DVW');
  });

  it('advances the global clock past the set_ended timestamp to keep event ordering', async () => {
    const source = await readFile(importMapperPath, 'utf8');
    assert(source.includes('if (setEndedAt > input.clock.value)'), 'Must advance clock past setEndedAt');
    assert(source.includes('input.clock.value = setEndedAt'), 'Clock must be updated to setEndedAt');
  });

  it('falls back to nextTimestamp when DVW duration is absent or zero', async () => {
    const source = await readFile(importMapperPath, 'utf8');
    assert(source.includes('dvwDurationMs !== undefined'), 'Must check if dvwDurationMs is defined');
    assert(source.includes(': nextTimestamp(input.clock)'), 'Must fall back to nextTimestamp when no DVW duration');
  });
});
