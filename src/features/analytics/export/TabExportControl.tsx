import { flushSync } from 'react-dom';
import { shortenWithCloud } from '@src/features/sharing/short-link';
import { shareBaseUrl } from '@src/lib/utils/share-base-url';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { ExternalLink } from '@src/components/ExternalLink';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { buildSharedStatsUrl, encodeSharedStats, type SharedMatchStats, type SharedStatsTabId } from './stats-share-link';
import type { SharedStatsSnapshot } from './shared-stats-snapshot';
import type { TabExportFormat } from './tab-export';
import './tab-export.css';

export function TabExportControl({ panelRef, title, matchLabel, tabId = 'generic', onBusyChange, onExportPdf, buildSnapshot }: {
  panelRef: RefObject<HTMLDivElement>;
  title: string;
  matchLabel: string;
  tabId?: SharedStatsTabId;
  onBusyChange: (busy: boolean) => void;
  onExportPdf?: () => Promise<void>;
  /** When given, the share link carries this tab's filtered data and the viewer redraws the real page. */
  buildSnapshot?: () => SharedStatsSnapshot;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDays, setShareDays] = useState(7);
  const [shareUrl, setShareUrl] = useState('');
  const [shareError, setShareError] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    setShareUrl('');
    setShareError(false);
    setShareCopied(false);
  }, [title, matchLabel]);

  const buildFooterLabel = (now: Date) => [
    t('tacticalCreatedFooter', { date: now.toLocaleDateString(), author: APP_METADATA.author.displayName }),
    APP_METADATA.urls.webApp,
    t('bookletFreeSoftware'),
    `GNU AGPL v3 or later (${APP_METADATA.license})`,
  ].join(' · ');

  const runExport = async (format: TabExportFormat) => {
    const panel = panelRef.current;
    if (!panel || pending.current) return;
    pending.current = true;
    panel.inert = true;
    setBusy(true);
    onBusyChange(true);
    setError(false);
    try {
      if (format === 'pdf' && onExportPdf) {
        await onExportPdf();
        return;
      }
      const { exportTabDocument } = await import('./tab-export');
      const now = new Date();
      await exportTabDocument(panel, format, title, matchLabel, {
        generatedAtLabel: t('pdfGeneratedAt', { date: now.toLocaleString() }),
        footerLabel: buildFooterLabel(now),
      });
    } catch (cause) {
      console.error('Tab export failed:', cause);
      setError(true);
    } finally {
      pending.current = false;
      panel.inert = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  const runCreateShareLink = async () => {
    const panel = panelRef.current;
    if (!panel || pending.current) return;
    pending.current = true;
    flushSync(() => {
      setBusy(true);
      onBusyChange(true);
    });
    setShareError(false);
    setShareCopied(false);
    setShareUrl('');
    try {
      const now = new Date();
      const expiresAt = sharedPlaylistExpiryAfter(shareDays)!;
      const isPublicWeb = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        // A local dev server shares links to itself, so the viewer can be tested before
        // publishing; only the desktop app (tauri.localhost) links to the public site.
        && !/^tauri\.localhost$/i.test(window.location.hostname);
      const baseUrl = shareBaseUrl();
      // The dev server has no static preview page (it is made by the build): link straight
      // to the viewer route there, which every version of the app opens.
      const toUrl = (stats: SharedMatchStats) => (import.meta.env.DEV && isPublicWeb
        ? `${baseUrl.replace(/[#?].*$/, '')}#/stats-viewer/${encodeSharedStats(stats)}`
        : buildSharedStatsUrl(baseUrl, stats));
      const blocksUrl = async () => {
        const { extractSharedTabBlocks } = await import('./tab-export');
        const blocks = extractSharedTabBlocks(panel);
        if (blocks.length === 0) {
          throw new Error('Empty tab content');
        }
        return toUrl({
          version: 2,
          tabId,
          title,
          matchLabel,
          blocks,
          expiresAt,
          generatedAt: now.getTime(),
        });
      };
      let url: string;
      if (buildSnapshot) {
        try {
          url = toUrl({
            version: 3,
            tabId,
            title,
            matchLabel,
            snapshot: buildSnapshot(),
            expiresAt,
            generatedAt: now.getTime(),
          });
        } catch (cause) {
          // Too much data for a link (many matches): share the drawn page instead.
          console.warn('Data link too large, sharing the drawn page:', cause);
          url = await blocksUrl();
        }
      } else {
        url = await blocksUrl();
      }
      // Too long for chat apps: a short link through the connected Google Drive, when there is one.
      const payload = url.slice(url.indexOf('#') + 1).replace(/^\/stats-viewer\//, '');
      url = await shortenWithCloud(url, `#/stats-viewer/${payload}`, baseUrl);
      setShareUrl(url);
    } catch (cause) {
      console.error('Tab share link failed:', cause);
      setShareError(true);
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      // Fallback: textarea remains selectable for manual copy.
    }
  };

  return <div className="tab-export" data-html-to-image-ignore="true">
    <div className="tab-export__formats" role="group" aria-label={t('exportCurrentTab')} aria-busy={busy}>
      <span className="tab-export__label"><ActionIcon name="export" />{t('exportCurrentTab')}</span>
      {(['pdf', 'pptx', 'ods', 'svg'] as const).map(format => <button
        key={format}
        type="button"
        className="btn-secondary tab-export__format"
        disabled={busy}
        aria-label={`${t('exportCurrentTab')} · ${title} · ${format.toUpperCase()}`}
        title={format === 'ods' ? t('exportCurrentTabOdsHelp') : `${title} · ${format.toUpperCase()}`}
        onClick={() => void runExport(format)}
      ><ActionIcon name={format} /><span>{format.toUpperCase()}</span></button>)}
      <div className={`tab-export__share-menu${shareOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className={`btn-secondary tab-export__format tab-export__share-toggle${shareOpen ? ' is-active' : ''}`}
          aria-expanded={shareOpen}
          aria-pressed={shareOpen}
          onClick={() => setShareOpen((open) => !open)}
        >
          <ActionIcon name="web" />
          <span>{t('shareViaWeb')}</span>
          <span className="tab-export__share-caret" aria-hidden="true">{shareOpen ? '▴' : '▾'}</span>
        </button>
        {shareOpen ? (
          <div className="tab-export__share-popover" role="region" aria-label={t('shareViaWeb')}>
            <div className="tab-export__share-popover-header">
              <strong>{t('shareViaWeb')}</strong>
              <button
                type="button"
                className="btn-secondary btn-small tab-export__share-close"
                aria-label={t('opponentReportBoardCloseSvg')}
                onClick={() => setShareOpen(false)}
              >
                ✕
              </button>
            </div>
            <label className="tab-export__share-days">
              <span>{t('tacticalExpiryDays')}</span>
              <input
                type="number"
                min={1}
                max={90}
                value={shareDays}
                onChange={(event) => {
                  setShareDays(Math.max(1, Math.min(90, Number(event.target.value) || 1)));
                  setShareUrl('');
                  setShareCopied(false);
                }}
              />
            </label>
            <p className="tab-export__share-help">{t('tacticalShareHelp')}</p>
            <button
              type="button"
              className="btn-primary tab-export__share-btn"
              disabled={busy}
              onClick={() => void runCreateShareLink()}
            >
              <ActionIcon name="web" />{t('tacticalCreateLink')}
            </button>
            {shareError ? <p role="alert">{t('tacticalShareError')}</p> : null}
            {shareUrl ? (
              <div className="tab-export__share-result">
                <textarea
                  readOnly
                  rows={3}
                  value={shareUrl}
                  aria-label={t('shareViaWeb')}
                  onFocus={(event) => event.target.select()}
                />
                <div className="tab-export__share-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => void copyShareUrl()}
                  >
                    <ActionIcon name="copy" />{t(shareCopied ? 'videoYoutubeShareCopied' : 'videoYoutubeShareCopy')}
                  </button>
                  <a
                    className="btn-secondary btn-small"
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ActionIcon name="preview" />{t('tacticalPreview')}
                  </a>
                  <ExternalLink
                    className="btn-secondary btn-small"
                    href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`}
                  >
                    <ActionIcon name="whatsapp" />{t('videoYoutubeShareWhatsApp')}
                  </ExternalLink>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
    {busy ? <p role="status">{t('exportCurrentTabBusy')}</p> : null}
    {error ? <p role="alert">{t('exportCurrentTabFailed')}</p> : null}
  </div>;
}
