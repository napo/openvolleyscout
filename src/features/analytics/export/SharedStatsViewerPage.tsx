// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { decodeSharedStats, isSharedStatsExpired } from './stats-share-link';
import '@src/features/opponent-reports/pages/opponent-reports.css';

/** Public standalone viewer for shared match statistics tabs: SVG rendered as an image document, never injected into DOM. */
export function SharedStatsViewerPage() {
  const { payload = '' } = useParams();
  const { t, locale } = useTranslation();
  const stats = useMemo(() => decodeSharedStats(payload), [payload]);
  const [now, setNow] = useState(Date.now);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!stats) {
    return (
      <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared">
        <p>{t('tacticalInvalidLink')}</p>
      </main>
    );
  }

  if (isSharedStatsExpired(stats, now)) {
    return (
      <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared">
        <p>{t('tacticalExpiredLink')}</p>
      </main>
    );
  }

  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared">
      <h1>{stats.title}</h1>
      {stats.matchLabel ? <p>{stats.matchLabel}</p> : null}
      <a href={APP_METADATA.urls.releases} target="_blank" rel="noopener noreferrer">
        {t('tacticalDownloadSoftware')}
      </a>
      <p>{t('opponentReportVideoLink', { date: new Date(stats.expiresAt).toLocaleDateString() })}</p>
      <section>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setZoomed((current) => !current)}
        >
          {t(zoomed ? 'tacticalFit' : 'tacticalZoom')}
        </button>
        <div className={zoomed ? 'tactical-sheet-scroll tactical-sheet-scroll--zoomed' : 'tactical-sheet-scroll'}>
          <img
            className="tactical-preview"
            alt={`${stats.title}${stats.matchLabel ? ` - ${stats.matchLabel}` : ''}`}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(stats.svg)}`}
          />
        </div>
      </section>
      <footer className="tactical-shared__footer">
        <small>{t('tacticalAttributionFooter')}</small>
      </footer>
    </main>
  );
}
