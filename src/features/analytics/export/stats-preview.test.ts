// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildStatsViewerPreviewPage } from './stats-preview';

const texts = { title: 'Shared "statistics"', subtitle: 'Shared match statistics', appName: 'OpenVolleyScout' };

describe('stats viewer preview page', () => {
  const html = buildStatsViewerPreviewPage(texts, 'https://example.org/ovs/');

  it('writes the social tags with the statistics picture', () => {
    expect(html).toContain('<meta property="og:url" content="https://example.org/ovs/stats-viewer/" />');
    expect(html).toContain('<meta property="og:image" content="https://example.org/ovs/social-preview-stats.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('Shared &quot;statistics&quot;');
  });

  it('forwards the fragment to the viewer inside the app, relative to its own address', () => {
    expect(html).toContain("new URL('../#/stats-viewer'+(h?'/'+h:''),location.href)");
    expect(html).toContain('<noscript><meta http-equiv="refresh" content="0; url=../#/stats-viewer" /></noscript>');
  });

  it('the forwarding script keeps the payload', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    let target = '';
    const location = { hash: '#1.abc-_', href: 'https://example.org/ovs/stats-viewer/', replace: (value: string) => { target = value; } };
    new Function('location', 'URL', script)(location, URL);
    expect(target).toBe('https://example.org/ovs/#/stats-viewer/1.abc-_');
    new Function('location', 'URL', script)({ ...location, hash: '' }, URL);
    expect(target).toBe('https://example.org/ovs/#/stats-viewer');
  });
});

describe('default preview texts', () => {
  it('are in English', () => {
    const page = buildStatsViewerPreviewPage(undefined, 'https://example.org/ovs/');
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('Shared statistics · OpenVolleyScout');
  });
});
