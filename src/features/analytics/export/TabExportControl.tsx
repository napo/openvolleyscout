import { useRef, useState, type RefObject } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
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
  const pending = useRef(false);
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
        footerLabel: [
          t('tacticalCreatedFooter', { date: now.toLocaleDateString(), author: APP_METADATA.author.name }),
          APP_METADATA.urls.webApp,
          t('bookletFreeSoftware'),
          `GNU AGPL v3 or later (${APP_METADATA.license})`,
        ].join(' · '),
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
    </div>
    {busy ? <p role="status">{t('exportCurrentTabBusy')}</p> : null}
    {error ? <p role="alert">{t('exportCurrentTabFailed')}</p> : null}
  </div>;
}
