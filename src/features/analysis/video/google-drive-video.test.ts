// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { googleDriveFileId, toPlayableVideoUrl } from './google-drive-video';

const ID = '1AbC-dEf_GhIjKlMnOpQrStUvWxYz0123';

describe('googleDriveFileId', () => {
  it('reads the id of share, open, download and API links', () => {
    expect(googleDriveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(googleDriveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(googleDriveFileId(`https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`)).toBe(ID);
    expect(googleDriveFileId(`https://www.googleapis.com/drive/v3/files/${ID}`)).toBe(ID);
  });

  it('ignores other links and malformed ids', () => {
    expect(googleDriveFileId('https://www.dropbox.com/s/abc/match.mp4?raw=1')).toBeNull();
    expect(googleDriveFileId('https://drive.google.com/drive/folders/xyz')).toBeNull();
    expect(googleDriveFileId('https://drive.google.com/open?id=bad%20id')).toBeNull();
    expect(googleDriveFileId('not a url')).toBeNull();
  });
});

describe('toPlayableVideoUrl', () => {
  it('plays Drive files through the Drive API with the key', () => {
    expect(toPlayableVideoUrl(`https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`, 'KEY'))
      .toBe(`https://www.googleapis.com/drive/v3/files/${ID}?alt=media&key=KEY`);
  });

  it('leaves the link unchanged without a key or for other hosts', () => {
    const drive = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`;
    expect(toPlayableVideoUrl(drive, '')).toBe(drive);
    expect(toPlayableVideoUrl('https://example.com/match.mp4', 'KEY')).toBe('https://example.com/match.mp4');
  });
});
