// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The match video while preparing a match, in the quick and full setup:
 * either a remote link (YouTube, Dropbox, OneDrive, Google Drive, direct) or a
 * file on this computer. Both are optional and can be added later.
 */

import { useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getFilePath } from '@src/domain/video/types';
import { supportsFileSystemAccess } from '@src/features/analysis/video/file-handle-store';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '@src/lib/utils/pick-file';
import { useTranslation } from '@src/i18n';

export interface SetupVideoFile {
  readonly path: string;
  readonly fileName: string;
  /** Browser only (Chrome, Edge): lets Video analysis reopen the file later. */
  readonly handle?: FileSystemFileHandle;
}

interface SetupVideoFieldProps {
  url: string;
  file: SetupVideoFile | null;
  error?: string;
  onUrlChange: (url: string) => void;
  onFileChange: (file: SetupVideoFile | null) => void;
  /** Class of each field wrapper, to match the surrounding form. */
  inputClassName?: string;
}

export function SetupVideoField({ url, file, error, onUrlChange, onFileChange, inputClassName }: SetupVideoFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = async () => {
    if (isTauri()) {
      const path = await pickFilePath(VIDEO_FILE_DIALOG_FILTERS);
      if (path) onFileChange({ path, fileName: path.split(/[\\/]/).pop() ?? path });
      return;
    }
    if (supportsFileSystemAccess() && window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ogv'] } }],
        });
        const picked = await handle.getFile();
        onFileChange({ path: picked.name, fileName: picked.name, handle });
      } catch {
        // Picker dismissed.
      }
      return;
    }
    inputRef.current?.click();
  };

  return (
    <div className="setup-video-field">
      {file ? (
        <div className="setup-video-field__file">
          <span>{t('setupVideoFileChosen', { name: file.fileName })}</span>
          <button type="button" className="btn-secondary btn-small" onClick={() => onFileChange(null)}>
            {t('setupVideoFileRemove')}
          </button>
        </div>
      ) : (
        <>
          <input
            type="url"
            className={inputClassName}
            value={url}
            placeholder={t('videoYoutubeUrlPlaceholder')}
            onChange={(event) => onUrlChange(event.target.value)}
            aria-label={t('matchVideoLink')}
          />
          <div className="setup-video-field__or">
            <span>{t('setupVideoOr')}</span>{' '}
            <button type="button" className="btn-secondary btn-small" onClick={() => void pickFile()}>
              {t('setupVideoPickFile')}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) onFileChange({ path: getFilePath(picked), fileName: picked.name });
              event.target.value = '';
            }}
          />
        </>
      )}
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
