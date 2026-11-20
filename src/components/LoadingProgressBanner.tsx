// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';

export interface LoadProgressState {
  loaded: number;
  total: number;
  currentName: string;
}

/** Yields one animation frame + macrotask so the browser paints progress updates before heavy synchronous work. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function LoadingProgressBanner({
  progress,
  prefix,
  label,
  indeterminate = false,
  marginBottom,
}: {
  progress: LoadProgressState | null;
  prefix?: string;
  label?: string;
  indeterminate?: boolean;
  marginBottom?: string;
}) {
  const { t } = useTranslation();
  const detail = progress?.currentName || label || '';
  const title = detail
    ? (prefix ? `${prefix}: ${detail}` : detail)
    : (prefix ? `${prefix}: ${t('loading')}` : t('loading'));
  const hasDeterminateProgress = !indeterminate && Boolean(progress && progress.total > 0);

  return (
    <div
      className="app-loading-banner app-loading-progress"
      role="status"
      aria-live="polite"
      style={marginBottom ? { marginBottom } : undefined}
    >
      <div className="app-loading-progress__row">
        <span className="app-loading-progress__title">
          <span className="app-loading-spinner" aria-hidden="true" />
          <strong>{title}</strong>
        </span>
        {hasDeterminateProgress && progress ? (
          <span>{progress.loaded} / {progress.total}</span>
        ) : null}
      </div>
      {hasDeterminateProgress && progress ? (
        <progress
          className="app-loading-progress__bar"
          value={progress.loaded}
          max={progress.total}
        />
      ) : (
        <progress className="app-loading-progress__bar" />
      )}
    </div>
  );
}
