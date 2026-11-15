// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tutorials made of real screenshots of the app (tactical report, video
 * synchronization and sharing). Pictures live in `public/tutorials/<lang>/`
 * and are taken by `tools/docs-screenshots`: Italian and English sets, the
 * English set serving every other language.
 */
import type { TranslationKey } from '@src/i18n';

export type ImageTutorialId = 'tacticalReport' | 'videoSync';

export interface ImageTutorialSlide {
  image: string;
  captionKey: TranslationKey;
}

export interface ImageTutorial {
  id: ImageTutorialId;
  titleKey: TranslationKey;
  slides: ImageTutorialSlide[];
}

export const IMAGE_TUTORIALS: Record<ImageTutorialId, ImageTutorial> = {
  tacticalReport: {
    id: 'tacticalReport',
    titleKey: 'tutorialTacticalTitle',
    slides: [
      { image: 'tr-00a-data-demo', captionKey: 'tutorialTacticalStart1' },
      { image: 'import-preview', captionKey: 'tutorialTactical01' },
      { image: 'tr-00b-menu-reports', captionKey: 'tutorialTactical02' },
      { image: 'tr-02-setup', captionKey: 'tutorialTactical03' },
      { image: 'tr-03-editor', captionKey: 'tutorialTactical04' },
      { image: 'tr-04-serve-targets', captionKey: 'tutorialTactical05' },
      { image: 'tr-05-block-defence', captionKey: 'tutorialTactical06' },
      { image: 'tr-06-setter', captionKey: 'tutorialTactical07' },
      { image: 'tr-07-how-they-serve', captionKey: 'tutorialTactical08' },
      { image: 'tr-08-drawing', captionKey: 'tutorialTactical09' },
      { image: 'tr-09-preview', captionKey: 'tutorialTactical10' },
      { image: 'tr-10-share', captionKey: 'tutorialTactical11' },
      { image: 'tr-11-shared-page', captionKey: 'tutorialTactical12' },
    ],
  },
  videoSync: {
    id: 'videoSync',
    titleKey: 'tutorialVideoTitle',
    slides: [
      { image: 'vs-00a-menu-data', captionKey: 'tutorialVideoStart1' },
      { image: 'vs-00b-data-stats', captionKey: 'tutorialVideoStart2' },
      { image: 'vs-00c-tab-video', captionKey: 'tutorialVideoStart3' },
      { image: 'vs-01-source', captionKey: 'tutorialVideo01' },
      { image: 'vs-02-youtube-notice', captionKey: 'tutorialVideo02' },
      { image: 'vs-03-loaded', captionKey: 'tutorialVideo03' },
      { image: 'vs-04-calibration', captionKey: 'tutorialVideo04' },
      { image: 'vs-05-rapid', captionKey: 'tutorialVideo05' },
      { image: 'vs-06-sync-points', captionKey: 'tutorialVideo06' },
      { image: 'vs-07-filters', captionKey: 'tutorialVideo07' },
      { image: 'vs-08-share', captionKey: 'tutorialVideo08' },
      { image: 'vs-09-player', captionKey: 'tutorialVideo09' },
      { image: 'vs-10-player-phone', captionKey: 'tutorialVideo10' },
    ],
  },
};

/** Screenshots exist in Italian and English; other languages use the English ones. */
export function tutorialImageUrl(image: string, locale: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const language = locale === 'it' ? 'it' : 'en';
  return `${baseUrl}tutorials/${language}/${image}.png`;
}
