// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';

export interface LoadProgressState {
  loaded: number;
  total: number;
  currentName: string;
}

export function LoadingProgressBanner({
  progress,
  prefix,
  marginBottom,
}: {
  progress: LoadProgressState | null;
  prefix?: string;
  marginBottom?: string;
}) {
  const { t } = useTranslation();
  const title = progress?.currentName
    ? (prefix ? `${prefix}: ${progress.currentName}` : progress.currentName)
    : (prefix ? `${prefix}: ${t('loading')}` : t('loading'));

  return (
    <div
      className="app-loading-banner app-loading-progress"
      role="status"
      aria-live="polite"
      style={marginBottom ? { marginBottom } : undefined}
    >
      <div className="app-loading-progress__row">
        <strong>{title}</strong>
        {progress && progress.total > 0 ? (
          <span>{progress.loaded} / {progress.total}</span>
        ) : null}
      </div>
      {progress && progress.total > 0 ? (
        <progress
          className="app-loading-progress__bar"
          value={progress.loaded}
          max={progress.total}
        />
      ) : null}
    </div>
  );
}
