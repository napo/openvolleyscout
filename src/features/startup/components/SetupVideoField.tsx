// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The match video while preparing a match, in the quick and full setup:
 * either a remote link (YouTube, Dropbox, OneDrive, Google Drive, direct) or a
 * file on this computer, chosen with a button or dropped on the field. Both
 * are optional and can be added later.
 */

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getFilePath } from '@src/domain/video/types';
import { supportsFileSystemAccess } from '@src/features/analysis/video/file-handle-store';
import { formatBytes } from '@src/features/sync/cloud/video-sync';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '@src/lib/utils/pick-file';
import { useTranslation } from '@src/i18n';
import './setup-video-field.css';

export interface SetupVideoFile {
  readonly path: string;
  readonly fileName: string;
  /** Bytes, when known. */
  readonly size?: number;
  /** Browser only (Chrome, Edge): lets Video analysis reopen the file later. */
  readonly handle?: FileSystemFileHandle;
  /** Browser only: the chosen file itself, playable until the page is closed. */
  readonly file?: File;
}

interface SetupVideoFieldProps {
  url: string;
  file: SetupVideoFile | null;
  error?: string;
  onUrlChange: (url: string) => void;
  onFileChange: (file: SetupVideoFile | null) => void;
  /** Class of the link input, to match the surrounding form. */
  inputClassName?: string;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ogv'];

async function fileSize(path: string): Promise<number | undefined> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const size = await invoke<number | null>('video_file_size', { path });
    return typeof size === 'number' ? size : undefined;
  } catch {
    return undefined;
  }
}

export function SetupVideoField({ url, file, error, onUrlChange, onFileChange, inputClassName }: SetupVideoFieldProps) {
  const { t, locale } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'link' | 'file'>(file ? 'file' : 'link');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (file) setMode('file');
  }, [file]);

  // A desktop file chosen earlier has no size yet: read it once.
  useEffect(() => {
    if (!file || file.size !== undefined || !isTauri()) return;
    let alive = true;
    void fileSize(file.path).then((size) => { if (alive && size !== undefined) onFileChange({ ...file, size }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path]);

  const pickFile = async () => {
    if (isTauri()) {
      const path = await pickFilePath(VIDEO_FILE_DIALOG_FILTERS);
      if (path) onFileChange({ path, fileName: path.split(/[\\/]/).pop() ?? path, size: await fileSize(path) });
      return;
    }
    if (supportsFileSystemAccess() && window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Video', accept: { 'video/*': VIDEO_EXTENSIONS } }],
        });
        const picked = await handle.getFile();
        onFileChange({ path: picked.name, fileName: picked.name, size: picked.size, handle, file: picked });
      } catch {
        // Picker dismissed.
      }
      return;
    }
    inputRef.current?.click();
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const item = event.dataTransfer.items?.[0] as (DataTransferItem & {
      getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
    }) | undefined;
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    const isVideo = dropped.type.startsWith('video/') || VIDEO_EXTENSIONS.some((ext) => dropped.name.toLowerCase().endsWith(ext));
    if (!isVideo) return;
    const handle = await item?.getAsFileSystemHandle?.().catch(() => null);
    onFileChange({
      path: getFilePath(dropped),
      fileName: dropped.name,
      size: dropped.size,
      file: dropped,
      ...(handle?.kind === 'file' ? { handle: handle as FileSystemFileHandle } : {}),
    });
  };

  return (
    <div className="setup-video-field">
      <div className="setup-video-field__modes" role="tablist" aria-label={t('matchVideoLink')}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'link'}
          className={`setup-video-field__mode${mode === 'link' ? ' setup-video-field__mode--active' : ''}`}
          onClick={() => setMode('link')}
        >
          {t('setupVideoModeLink')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'file'}
          className={`setup-video-field__mode${mode === 'file' ? ' setup-video-field__mode--active' : ''}`}
          onClick={() => setMode('file')}
        >
          {t('setupVideoModeFile')}
        </button>
      </div>

      {mode === 'link' ? (
        <input
          type="url"
          className={inputClassName ?? 'setup-video-field__url'}
          value={url}
          placeholder={t('videoYoutubeUrlPlaceholder')}
          onChange={(event) => {
            onUrlChange(event.target.value);
            if (event.target.value && file) onFileChange(null);
          }}
          aria-label={t('setupVideoModeLink')}
        />
      ) : file ? (
        <div className="setup-video-field__chosen">
          <span className="setup-video-field__icon" aria-hidden="true">🎬</span>
          <span className="setup-video-field__name">
            <strong>{file.fileName}</strong>
            {file.size !== undefined ? <small>{formatBytes(file.size, locale)}</small> : null}
          </span>
          <button type="button" className="btn-secondary btn-small" onClick={() => void pickFile()}>
            {t('setupVideoFileChange')}
          </button>
          <button type="button" className="btn-secondary btn-small" onClick={() => onFileChange(null)}>
            {t('setupVideoFileRemove')}
          </button>
        </div>
      ) : (
        <div
          className={`setup-video-field__drop${dragging ? ' setup-video-field__drop--over' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void handleDrop(event)}
        >
          <span>{t('setupVideoDropHint')}</span>
          <button type="button" className="btn-primary btn-small" onClick={() => void pickFile()}>
            {t('setupVideoPickFile')}
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onFileChange({ path: getFilePath(picked), fileName: picked.name, size: picked.size, file: picked });
          event.target.value = '';
        }}
      />
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
