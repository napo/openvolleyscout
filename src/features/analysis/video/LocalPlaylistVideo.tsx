import { forwardRef, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { LocalPlaylist } from './playlist-file';

export const LocalPlaylistVideo = forwardRef<HTMLVideoElement, {
  playlist: LocalPlaylist;
  onLoading: () => void;
  onReady: () => void;
  onPlayingChange: (playing: boolean) => void;
  code: string;
}>(({ playlist, onLoading, onReady, onPlayingChange, code }, ref) => {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<{ playlist: LocalPlaylist; file: File } | null>(null);
  const file = selection?.playlist === playlist ? selection.file : null;
  const [resource, setResource] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const url = resource?.file === file ? resource?.url : undefined;
  useEffect(() => setError(false), [playlist]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setResource({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const select = (file: File) => {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|m4v|mov|ogv)$/i.test(file.name)) {
      setError(true);
      return;
    }
    setError(false);
    if (file === resource?.file) return;
    onLoading();
    setSelection({ playlist, file });
  };

  return <>
    <section className="shared-playlist__dropzone shared-playlist__local-video"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        if (event.dataTransfer.files.length === 1) select(event.dataTransfer.files[0]);
        else setError(true);
      }}>
      <h2>{t('videoPlaylistLocalTitle')}</h2>
      <p>{t('videoPlaylistLocalPrompt')}</p>
      {playlist.source.fileName ? <p>{t('videoPlaylistLocalExpected', { name: playlist.source.fileName })}</p> : null}
      <input ref={pickerRef} type="file" accept="video/*,.mp4,.webm,.m4v,.mov,.ogv" hidden
        aria-label={t('videoPlaylistLocalChoose')}
        onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) select(file);
        }} />
      <button type="button" className="btn-primary" onClick={() => pickerRef.current?.click()}>{t('videoPlaylistLocalChoose')}</button>
      <p>{t('videoPlaylistLocalPrivacy')}</p>
      {file ? <p>{t('videoPlaylistLocalSelected', { name: file.name })}</p> : null}
      {error ? <p className="shared-playlist__error" role="alert">{t('videoPlaylistLocalError')}</p> : null}
    </section>
    {url ? <div className="shared-playlist__stage"><video key={url} ref={ref} src={url} controls playsInline preload="metadata"
      className="shared-playlist__local-player"
      onLoadedMetadata={onReady}
      onPlay={() => onPlayingChange(true)} onPause={() => onPlayingChange(false)}
      onError={() => { setError(true); onLoading(); }}
    />{code ? <div className="shared-playlist__code">{code}</div> : null}</div> : null}
  </>;
});
