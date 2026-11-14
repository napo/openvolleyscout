// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Demo match for the web app: Melodic Spikers - Hollywood Blockers, imported
 * once on the first visit so everyone can try analysis, tactical reports and
 * the tutorials without data of their own. It is marked as demo and can be
 * deleted like any match; it is not imported again afterwards.
 */
import { isTauri } from '@tauri-apps/api/core';
import type { MatchProject } from '@src/domain/match/types';
import {
  mapDataVolleyMatchToOvsProject,
  parseDataVolleyFile,
  persistDataVolleyImportedTeams,
} from '@src/features/import';
import { matchRepository, teamRepository } from '@src/infrastructure/repositories';

export const DEMO_MATCH_FILE = 'samples/demo-melodic-spikers-hollywood-blockers.dvw';
const SEEDED_KEY = 'openvolleyscout.demoMatchSeeded';

export function isDemoMatch(project: Pick<MatchProject, 'metadata'>): boolean {
  return project.metadata.isDemo === true;
}

function readSeeded(): boolean {
  try {
    return window.localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    // Storage blocked: do not import on every visit.
    return true;
  }
}

function markSeeded(): void {
  try {
    window.localStorage.setItem(SEEDED_KEY, '1');
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
 * Imports the demo match on the first visit to the web app. Silent on
 * failure (offline, storage full): the app works the same without it.
 */
export async function seedDemoMatchOnce(baseUrl: string = import.meta.env.BASE_URL): Promise<boolean> {
  if (isTauri() || readSeeded()) return false;
  try {
    const existing = await matchRepository.list();
    markSeeded();
    if (existing.some(isDemoMatch)) return false;
    const response = await fetch(`${baseUrl}${DEMO_MATCH_FILE}`);
    if (!response.ok) return false;
    await matchRepository.create(await buildDemoMatch(await response.arrayBuffer()));
    return true;
  } catch (error) {
    console.warn('[OpenVolleyScout] Demo match not imported:', error);
    return false;
  }
}
