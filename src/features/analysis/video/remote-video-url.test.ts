// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { getDownloadableRemoteUrl, resolveRemoteVideoSource } from './remote-video-url';

describe('resolveRemoteVideoSource', () => {
  it('recognizes YouTube URLs', () => {
    const res = resolveRemoteVideoSource('https://youtu.be/dQw4w9WgXcQ');
    expect(res).toEqual({
      ok: true,
      source: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ' },
    });
  });

  it('normalizes Dropbox file links to raw=1 for streaming', () => {
    const res = resolveRemoteVideoSource(
      'https://www.dropbox.com/scl/fi/abc123/match.mp4?rlkey=xyz&dl=0',
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.source.kind === 'url') {
      const parsed = new URL(res.source.url);
      expect(parsed.searchParams.get('raw')).toBe('1');
      expect(parsed.searchParams.get('dl')).toBeNull();
      expect(parsed.searchParams.get('rlkey')).toBe('xyz');
    }
  });

  it('rejects Dropbox shared folder links with a dedicated reason', () => {
    const res = resolveRemoteVideoSource(
      'https://www.dropbox.com/scl/fo/ftvufwa4bjy717yig7gef/ABbUhrIuolaBXQhDSQsk27E?dl=0&preview=match.mp4&rlkey=mxeep0ot7zl73wf2kervqokjx',
    );
    expect(res).toEqual({ ok: false, reason: 'dropbox_folder' });
  });

  it('accepts direct HTTP/HTTPS video URLs and rejects invalid ones', () => {
    expect(resolveRemoteVideoSource('https://cdn.example.com/match.mp4')).toEqual({
      ok: true,
      source: { kind: 'url', url: 'https://cdn.example.com/match.mp4' },
    });
    expect(resolveRemoteVideoSource('ftp://cdn.example.com/match.mp4')).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveRemoteVideoSource('not-a-url')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('converts Dropbox streaming URLs to dl=1 for optional download', () => {
    const dl = getDownloadableRemoteUrl('https://www.dropbox.com/scl/fi/abc123/match.mp4?rlkey=xyz&raw=1');
    const parsed = new URL(dl);
    expect(parsed.searchParams.get('dl')).toBe('1');
    expect(parsed.searchParams.get('raw')).toBeNull();
  });
});

describe('OneDrive and Google Drive links', () => {
  const url = (raw: string) => {
    const res = resolveRemoteVideoSource(raw);
    return res.ok && res.source.kind === 'url' ? res.source.url : res;
  };

  it('turns a OneDrive personal share link into the public shares endpoint', () => {
    const link = 'https://1drv.ms/v/s!AbCdEf123?e=xyz';
    const encoded = btoa(link).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    expect(url(link)).toBe(`https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`);
  });

  it('adds download=1 to OneDrive for work or school links', () => {
    expect(url('https://club-my.sharepoint.com/:v:/g/personal/coach/EAbc?e=1')).toBe(
      'https://club-my.sharepoint.com/:v:/g/personal/coach/EAbc?e=1&download=1',
    );
  });

  it('turns Google Drive file links into a direct download link', () => {
    const expected = 'https://drive.usercontent.google.com/download?id=1AbC-d_E&export=download&confirm=t';
    expect(url('https://drive.google.com/file/d/1AbC-d_E/view?usp=sharing')).toBe(expected);
    expect(url('https://drive.google.com/open?id=1AbC-d_E')).toBe(expected);
  });

  it('refuses folder links', () => {
    expect(resolveRemoteVideoSource('https://drive.google.com/drive/folders/1AbC')).toEqual({ ok: false, reason: 'cloud_folder' });
    expect(resolveRemoteVideoSource('https://club-my.sharepoint.com/:f:/g/personal/coach/EAbc')).toEqual({ ok: false, reason: 'cloud_folder' });
  });
});
