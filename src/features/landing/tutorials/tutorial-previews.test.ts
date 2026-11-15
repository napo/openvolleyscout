// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildTutorialPreviewPage, listTutorialPreviews } from './tutorial-previews';
import { TUTORIAL_SLUGS } from './tutorial-links';

describe('tutorial preview pages', () => {
  it('covers every tutorial, with its first picture when it has one', () => {
    const previews = listTutorialPreviews();
    expect(previews.map((preview) => preview.slug).sort()).toEqual(Object.values(TUTORIAL_SLUGS).sort());
    expect(previews.find((preview) => preview.slug === 'tag')?.image).toBe('tag-01');
    expect(previews.find((preview) => preview.slug === 'court')?.image).toBeUndefined();
  });

  it('writes social tags and sends the browser into the app', () => {
    const tag = listTutorialPreviews().find((preview) => preview.slug === 'tag')!;
    const html = buildTutorialPreviewPage(tag, { title: 'Rilevazione "Tag"', subtitle: 'Tutorial', appName: 'OpenVolleyScout' }, 'https://example.org/ovs/');
    expect(html).toContain('<meta property="og:image" content="https://example.org/ovs/tutorials/it/tag-01.png" />');
    expect(html).toContain('<meta property="og:url" content="https://example.org/ovs/tutorial/tag/" />');
    expect(html).toContain('location.replace("https://example.org/ovs/#/tutorial/tag")');
    expect(html).toContain('Rilevazione &quot;Tag&quot;');
  });
});
