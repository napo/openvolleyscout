import { useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { ActionIcon } from '@src/components/ActionIcon';
import { ExternalLink } from '@src/components/ExternalLink';
import { APP_METADATA } from '@src/lib/constants/app';
import { copyText } from '@src/lib/utils/copy-text';
import { saveFile } from '@src/lib/utils/save-file';
import { useTranslation } from '@src/i18n';
import { encodePlaylistFile, isLocalPlaylist, PLAYLIST_FILE_EXTENSION, type PlaylistDocument } from './playlist-file';
import { sharedPlaylistExpiryAfter } from './youtube-share-link';

export function PlaylistFileActions({ playlist, fileBaseName, expiresInDays }: {
  playlist: PlaylistDocument;
  fileBaseName: string;
  expiresInDays?: number | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const base = isTauri() ? APP_METADATA.urls.webApp : `${window.location.origin}${window.location.pathname}`;
  const playerUrl = `${base.replace(/\/+$/, '')}/#/player`;
  const instructions = t(isLocalPlaylist(playlist) ? 'videoPlaylistLocalInstructions' : 'videoPlaylistFileInstructions', { url: playerUrl });
  const save = async () => {
    setError(false);
    try {
      const document = expiresInDays === undefined ? playlist : { ...playlist, expiresAt: sharedPlaylistExpiryAfter(expiresInDays) };
      await saveFile(`${fileBaseName}${PLAYLIST_FILE_EXTENSION}`, encodePlaylistFile(document), 'application/json');
    } catch (cause) {
      console.error('Error saving playlist file:', cause);
      setError(true);
    }
  };
  return <div className="video-analysis__playlist-file-help">
    <button type="button" className="btn-secondary" onClick={() => void save()} disabled={!playlist.clips.length}>
      <ActionIcon name="export" />{t('videoPlaylistFileExport')}
    </button>
    <p>{instructions}</p>
    <div className="video-analysis__inline-form">
      <ExternalLink href={playerUrl}>{t('videoSharedPlayerOpenInBrowser')}</ExternalLink>
      <button type="button" className="btn-secondary" onClick={() => void copyText(instructions, null).then(setCopied)}>
        {t(copied ? 'videoPlaylistFileInstructionsCopied' : 'videoPlaylistFileCopyInstructions')}
      </button>
    </div>
    {error ? <p className="video-analysis__error" role="alert">{t('videoPlaylistFileSaveError')}</p> : null}
  </div>;
}
