import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { posix } from 'node:path';
import { buildTabOds, buildTabPptx } from './tab-export';

describe('statistics tab exports', () => {
  it('writes an ODS package with a stored first mimetype entry and escaped cell values', () => {
    const bytes = buildTabOds([['Atleta', 'Efficienza'], ['#01 <A&B>', '42,5%'], ['=1+1', '日本語']], "Gara & squadra: 1/2 'test'");
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype)).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint16(8, true)).toBe(0);
    expect(strFromU8(bytes.slice(30, 38))).toBe('mimetype');
    const content = strFromU8(files['content.xml']);
    expect(content).toContain('table:name="Gara &amp; squadra 1 2 test"');
    expect(content).toContain('#01 &lt;A&amp;B&gt;');
    expect(content).toContain('42,5%');
    expect(content).toContain('日本語');
    expect(content).not.toContain('table:formula');
    expect(strFromU8(files['META-INF/manifest.xml'])).toContain('manifest:full-path="content.xml"');
  });

  it('writes one slide per snapshot with internal image relationships and preserved aspect ratio', () => {
    const files = unzipSync(buildTabPptx([
      { base64: btoa('first-image'), width: 1000, height: 400 },
      { base64: btoa('second-image'), width: 1000, height: 500 },
    ], 'Squadra A & B'));
    expect(strFromU8(files['ppt/media/tab1.png'])).toBe('first-image');
    expect(strFromU8(files['ppt/media/tab2.png'])).toBe('second-image');
    const slide = strFromU8(files['ppt/slides/slide1.xml']);
    expect(slide).toContain('Squadra A &amp; B');
    expect(slide).toContain('r:embed="rIdImage"');
    expect(slide).toContain('cx="11582400" cy="4632960"');
    expect(strFromU8(files['[Content_Types].xml'])).toContain('Extension="png" ContentType="image/png"');
    for (const [path, bytes] of Object.entries(files).filter(([path]) => path.endsWith('.rels'))) {
      const base = path === '_rels/.rels' ? '' : posix.dirname(posix.dirname(path));
      for (const match of strFromU8(bytes).matchAll(/Target="([^"]+)"/g)) {
        expect(files[posix.normalize(posix.join(base, match[1]))], `${path} → ${match[1]}`).toBeDefined();
      }
    }
  });
});
