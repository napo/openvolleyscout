// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { decodeSharedStats, isSharedStatsExpired, type SharedStatsTabId } from './stats-share-link';
import '@src/features/opponent-reports/pages/opponent-reports.css';
import './tab-export.css';

const TAB_LABEL_KEYS: Partial<Record<SharedStatsTabId, TranslationKey>> = {
  report: 'matchReport',
  'team-performance': 'performanceTeams',
  'player-performance': 'performancePlayer',
  'sideout-study': 'sideOutStudy',
  'cross-rotation': 'crossRotationAnalysis',
  'play-by-play': 'pbpTitle',
  trends: 'trendsTitle',
  notes: 'pointNoteTab',
};

/**
 * Public standalone viewer for shared match statistics tabs.
 * Supports v2 compact data-driven payloads (rendered as native responsive HTML tables/sections)
 * and v1 legacy SVG snapshots (rendered safely as image documents, never injected into DOM).
 */
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

  const tabBadgeKey = stats.version === 2 ? TAB_LABEL_KEYS[stats.tabId] : undefined;

  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'} className="tactical-shared shared-stats-viewer">
      <header className="shared-stats-viewer__header">
        {tabBadgeKey ? <span className="shared-stats-viewer__badge">{t(tabBadgeKey)}</span> : null}
        <h1>{stats.title}</h1>
        {stats.matchLabel ? <p className="shared-stats-viewer__match">{stats.matchLabel}</p> : null}
        <div className="shared-stats-viewer__meta">
          <a href={APP_METADATA.urls.releases} target="_blank" rel="noopener noreferrer">
            {t('tacticalDownloadSoftware')}
          </a>
          <span>·</span>
          <span>{t('opponentReportVideoLink', { date: new Date(stats.expiresAt).toLocaleDateString() })}</span>
        </div>
      </header>

      {stats.version === 2 ? (
        <section className="shared-stats-viewer__content" data-tab-id={stats.tabId}>
          {stats.blocks.map((block, index) => {
            if (block.kind === 'heading') {
              return <h2 key={index} className="shared-stats-viewer__heading">{block.text}</h2>;
            }
            if (block.kind === 'text') {
              return <p key={index} className="shared-stats-viewer__text">{block.text}</p>;
            }
            if (block.kind === 'table') {
              const [head, ...body] = block.rows;
              return (
                <div key={index} className="shared-stats-viewer__table-wrap">
                  <table className="shared-stats-viewer__table">
                    {head ? (
                      <thead>
                        <tr>
                          {head.map((cell, ci) => <th key={ci}>{cell}</th>)}
                        </tr>
                      </thead>
                    ) : null}
                    <tbody>
                      {body.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            if (block.kind === 'bars') {
              return (
                <div key={index} className="shared-stats-viewer__bars-card">
                  {block.title ? <h3 className="shared-stats-viewer__bars-title">{block.title}</h3> : null}
                  <div className="shared-stats-viewer__bars-list">
                    {block.items.map((item, bi) => (
                      <div key={bi} className="shared-stats-viewer__bar-row">
                        <div className="shared-stats-viewer__bar-meta">
                          <span className="shared-stats-viewer__bar-label">{item.label}</span>
                          <strong className="shared-stats-viewer__bar-value">
                            {item.secondaryValueLabel !== undefined
                              ? `${item.valueLabel} / ${item.secondaryValueLabel}`
                              : item.valueLabel}
                          </strong>
                        </div>
                        {item.secondaryPct !== undefined ? (
                          <div className="shared-stats-viewer__bar-pair">
                            <div className="shared-stats-viewer__bar-track">
                              <div
                                className="shared-stats-viewer__bar-fill"
                                style={{ width: `${item.pct}%`, background: item.color }}
                              />
                            </div>
                            <div className="shared-stats-viewer__bar-track">
                              <div
                                className="shared-stats-viewer__bar-fill"
                                style={{ width: `${item.secondaryPct}%`, background: item.secondaryColor ?? '#dc2626' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="shared-stats-viewer__bar-track shared-stats-viewer__bar-track--bicolor">
                            <div
                              className="shared-stats-viewer__bar-fill"
                              style={{ width: `${item.pct}%`, background: item.color }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (block.kind === 'kpi') {
              return (
                <div key={index} className="shared-stats-viewer__kpi-grid">
                  {block.items.map((item, ki) => (
                    <div key={ki} className="shared-stats-viewer__kpi-card">
                      <span className="shared-stats-viewer__kpi-label">{item.label}</span>
                      <strong className="shared-stats-viewer__kpi-value">{item.value}</strong>
                      {item.sub ? <small className="shared-stats-viewer__kpi-sub">{item.sub}</small> : null}
                    </div>
                  ))}
                </div>
              );
            }
            if (block.kind === 'image') {
              return (
                <div key={index} className="shared-stats-viewer__chart-wrap">
                  <img
                    className="shared-stats-viewer__chart"
                    alt={block.alt || `${stats.title} - ${index + 1}`}
                    src={block.dataUrl}
                  />
                </div>
              );
            }
            return (
              <div key={index} className="shared-stats-viewer__chart-wrap">
                <img
                  className="shared-stats-viewer__chart"
                  alt={`${stats.title} - ${index + 1}`}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(block.svg)}`}
                />
              </div>
            );
          })}
        </section>
      ) : (
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
      )}

      <footer className="tactical-shared__footer">
        <small>{t('tacticalAttributionFooter')}</small>
      </footer>
    </main>
  );
}
