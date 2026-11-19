import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { ExternalLink } from '@src/components/ExternalLink';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { buildSharedStatsUrl } from './stats-share-link';
import type { TabExportFormat } from './tab-export';
import './tab-export.css';

export function TabExportControl({ panelRef, title, matchLabel, onBusyChange, onExportPdf }: {
  panelRef: RefObject<HTMLDivElement>;
  title: string;
  matchLabel: string;
  onBusyChange: (busy: boolean) => void;
  onExportPdf?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
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
    setBusy(true);
    onBusyChange(true);
    setShareError(false);
    setShareCopied(false);
    setShareUrl('');
    try {
      const { buildTabSvg } = await import('./tab-export');
      const now = new Date();
      const svg = buildTabSvg(panel, title, matchLabel, {
        headerSubtitle: t('pdfGeneratedAt', { date: now.toLocaleString() }),
        footer: buildFooterLabel(now),
      });
      const expiresAt = sharedPlaylistExpiryAfter(shareDays)!;
      const isPublicWeb = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        && !/^(localhost|127\.0\.0\.1|tauri\.localhost)$/i.test(window.location.hostname);
      const baseUrl = isPublicWeb
        ? `${window.location.origin}${window.location.pathname}`
        : APP_METADATA.urls.webApp;
      const url = buildSharedStatsUrl(baseUrl, {
        title,
        matchLabel,
        svg,
        expiresAt,
        generatedAt: now.getTime(),
      });
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
      <details className="tab-export__share-menu">
        <summary className="btn-secondary tab-export__format">
          <ActionIcon name="web" /><span>{t('tacticalShareLink')}</span>
        </summary>
        <div className="tab-export__share-popover">
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
                aria-label={t('tacticalShareLink')}
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
      </details>
    </div>
    {busy ? <p role="status">{t('exportCurrentTabBusy')}</p> : null}
    {error ? <p role="alert">{t('exportCurrentTabFailed')}</p> : null}
  </div>;
}
