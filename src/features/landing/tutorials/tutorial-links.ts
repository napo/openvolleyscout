// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every tutorial has its own address, e.g. https://…/#/tutorial/tag, to share
 * it: opening it shows About with that tutorial open. Slugs are stable and
 * language-neutral; links always use the public web address, like the shared
 * reports and playlists.
 */
// Relative import: this module is also loaded by vite.config.ts (social previews).
import { APP_METADATA } from '../../../lib/constants/app';
import type { ImageTutorialId } from './image-tutorials';

export type TutorialTopic = 'onboarding' | 'scouting' | ImageTutorialId;

export const TUTORIAL_SLUGS: Record<TutorialTopic, string> = {
  onboarding: 'getting-started',
  scoutingBasic: 'basic',
  scoutingCourt: 'court',
  scoutingCourtPhone: 'court-phone',
  // The full DataVolley rally replayed on the court, with every variant.
  scouting: 'court-rally',
  scoutingTag: 'tag',
  scoutingExpert: 'expert',
  videoSync: 'video',
  tacticalReport: 'tactical-report',
};

export function tutorialTopicFromSlug(slug: string | undefined): TutorialTopic | null {
  if (!slug) return null;
  const entry = (Object.entries(TUTORIAL_SLUGS) as Array<[TutorialTopic, string]>).find(([, value]) => value === slug);
  return entry ? entry[0] : null;
}

export function buildTutorialUrl(topic: TutorialTopic, base: string = APP_METADATA.urls.webApp): string {
  return `${base.replace(/\/+$/, '')}/#/tutorial/${TUTORIAL_SLUGS[topic]}`;
}
