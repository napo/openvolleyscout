// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '@src/i18n/locales/en';
import { it as italian } from '@src/i18n/locales/it';
import { IMAGE_TUTORIALS, tutorialImageUrl } from './image-tutorials';

describe('screenshot tutorials', () => {
  it('has a picture in both languages and a caption for every slide', () => {
    for (const tutorial of Object.values(IMAGE_TUTORIALS)) {
      expect((en as Record<string, string>)[tutorial.titleKey]).toBeTruthy();
      for (const slide of tutorial.slides) {
        for (const language of ['it', 'en']) expect(existsSync(`public/tutorials/${language}/${slide.image}.${slide.video ? 'mp4' : 'png'}`), `${language}/${slide.image}`).toBe(true);
        expect((en as Record<string, string>)[slide.captionKey]).toBeTruthy();
        expect((italian as Record<string, string>)[slide.captionKey]).toBeTruthy();
      }
    }
  });

  it('uses the English pictures for languages without their own', () => {
    expect(tutorialImageUrl('tr-01-list', 'it', '/')).toBe('/tutorials/it/tr-01-list.png');
    expect(tutorialImageUrl('tr-01-list', 'de', '/')).toBe('/tutorials/en/tr-01-list.png');
  });
});
