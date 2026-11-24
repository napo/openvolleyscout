// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Explains why a YouTube, Dropbox, OneDrive or Google Drive video could not be opened and what to do
 * instead. Videos that need an account cannot be played in the installed app:
 * it has no YouTube or Dropbox session of its own, and Google does not allow
 * signing in from inside an app.
 */

import type { MatchVideoSource } from '@src/domain/video/types';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { isDropboxHost, isGoogleDriveHost, isOneDriveHost } from './remote-video-url';
import { googleDriveApiKey } from './google-drive-video';

/** YouTube player errors: 100 private or removed, 101 and 150 embedding not allowed by the owner. */
const YOUTUBE_PRIVATE = 100;
const YOUTUBE_NOT_EMBEDDABLE = new Set([101, 150]);

function hostMatches(url: string, test: (hostname: string) => boolean): boolean {
  try {
    return test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function remoteVideoErrorKeys(
  source: Extract<MatchVideoSource, { kind: 'youtube' | 'url' }>,
  youtubeErrorCode: number | null,
): { title: TranslationKey; tips: TranslationKey[] } {
  if (source.kind === 'youtube') {
    if (youtubeErrorCode === YOUTUBE_PRIVATE) {
      return { title: 'videoYouTubePrivateError', tips: ['videoYouTubeTipUnlisted', 'videoTipDownload'] };
    }
    if (youtubeErrorCode !== null && YOUTUBE_NOT_EMBEDDABLE.has(youtubeErrorCode)) {
      return { title: 'videoYouTubeEmbedError', tips: ['videoYouTubeTipEmbedding', 'videoTipDownload'] };
    }
    return { title: 'videoYouTubeLoadError', tips: ['videoYouTubeTipUnlisted', 'videoTipDownload'] };
  }
  if (hostMatches(source.url, isDropboxHost)) {
    return { title: 'videoDropboxLoadError', tips: ['videoDropboxTipAnyone', 'videoTipDownload', 'videoDropboxTipSyncedFolder'] };
  }
  if (hostMatches(source.url, isOneDriveHost)) {
    return { title: 'videoOneDriveLoadError', tips: ['videoCloudTipAnyone', 'videoTipDownload', 'videoCloudTipSyncedFolder'] };
  }
  if (hostMatches(source.url, isGoogleDriveHost)) {
    // Through the Drive API (key configured) a failure almost always means the file is not
    // shared with "Anyone with the link", or Google limited it after many views.
    return {
      title: googleDriveApiKey() ? 'videoGoogleDriveApiLoadError' : 'videoGoogleDriveLoadError',
      tips: ['videoCloudTipAnyone', 'videoTipDownload', 'videoCloudTipSyncedFolder'],
    };
  }
  return { title: 'videoRemoteLoadError', tips: [] };
}

export function RemoteVideoErrorHelp({
  source,
  youtubeErrorCode,
}: {
  source: Extract<MatchVideoSource, { kind: 'youtube' | 'url' }>;
  youtubeErrorCode: number | null;
}) {
  const { t } = useTranslation();
  const { title, tips } = remoteVideoErrorKeys(source, youtubeErrorCode);
  return (
    <div className="video-analysis__error" role="alert">
      <p>{t(title)}</p>
      {tips.length > 0 ? (
        <ul>
          {tips.map((tip) => <li key={tip}>{t(tip)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
