// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Demo match for OVS (web and desktop/mobile): Melodic Spikers - Hollywood Blockers,
 * imported once on first launch so everyone can try analysis, tactical reports and
 * the tutorials without data of their own. It is marked as demo and can be
 * deleted like any match; it is not imported again afterwards.
 */
import type { MatchProject } from '@src/domain/match/types';
import {
  mapDataVolleyMatchToOvsProject,
  parseDataVolleyFile,
  persistDataVolleyImportedTeams,
} from '@src/features/import';
import { matchRepository, teamRepository } from '@src/infrastructure/repositories';

export const DEMO_MATCH_FILE = 'samples/demo-melodic-spikers-hollywood-blockers.dvw';
const SEEDED_KEY = 'openvolleyscout.demoMatchSeeded';
/**
 * Raise when the demo file changes: browsers holding an older demo replace it
 * once (only the match marked as demo is touched). Users who deleted the demo
 * do not get it back.
 */
export const DEMO_MATCH_VERSION = 2;

export function isDemoMatch(project: Pick<MatchProject, 'metadata'>): boolean {
  return project.metadata.isDemo === true;
}

/** Version of the demo this browser received: 0 never, null when storage is blocked. */
function readSeededVersion(): number | null {
  try {
    const value = window.localStorage.getItem(SEEDED_KEY);
    return value === null ? 0 : Number.parseInt(value, 10) || 0;
  } catch {
    return null;
  }
}

function markSeeded(): void {
  try {
    window.localStorage.setItem(SEEDED_KEY, String(DEMO_MATCH_VERSION));
  } catch {
    // Nothing to remember it in.
  }
}

/** Parses the demo file into a match marked as demo, with its two teams archived. */
export async function buildDemoMatch(data: ArrayBuffer): Promise<MatchProject> {
  const parsed = parseDataVolleyFile(data, { sourceName: 'demo-melodic-spikers-hollywood-blockers.dvw', dateOrder: 'auto' });
  const mapped = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo-melodic-spikers-hollywood-blockers.dvw' });
  const persisted = await persistDataVolleyImportedTeams(mapped.project, teamRepository, {});
  return { ...persisted.project, metadata: { ...persisted.project.metadata, isDemo: true } };
}

/**
 * Imports the demo match on first launch (unless storage is blocked or already seeded).
 * Silent on failure (offline, storage full): the app works the same without it.
 */
export async function seedDemoMatchOnce(baseUrl: string = import.meta.env.BASE_URL): Promise<boolean> {
  const seeded = readSeededVersion();
  // Storage blocked: do not import on every visit.
  if (seeded === null || seeded >= DEMO_MATCH_VERSION) return false;
  try {
    const demos = (await matchRepository.list()).filter(isDemoMatch);
    // An older demo is replaced; a deleted one stays deleted.
    if (seeded > 0 && demos.length === 0) {
      markSeeded();
      return false;
    }
    const response = await fetch(`${baseUrl}${DEMO_MATCH_FILE}`);
    if (!response.ok) return false;
    const demo = await buildDemoMatch(await response.arrayBuffer());
    for (const old of demos) await matchRepository.delete(old.metadata.id);
    await matchRepository.create(demo);
    markSeeded();
    return true;
  } catch (error) {
    console.warn('[OpenVolleyScout] Demo match not imported:', error);
    return false;
  }
}
