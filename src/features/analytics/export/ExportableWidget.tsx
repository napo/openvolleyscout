import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@src/i18n';
import { APP_METADATA } from '@src/lib/constants/app';
import { exportWidgetAsPdf } from './widget-pdf-export';
import './widget-export.css';

export interface ExportableWidgetProps {
  title: string;
  /** Preserves whatever outer class the widget used before wrapping (e.g. "perf-dashboard__section"). */
  className?: string;
  children: ReactNode;
}

/**
 * Wraps an analytics widget with an "export as PDF" button for that widget alone. The whole tab is
 * exported from the tab's own export control. Purely additive: the wrapped widget's own
 * markup/behavior is unchanged.
 */
export function ExportableWidget({ title, className, children }: ExportableWidgetProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleExport = async () => {
    if (!ref.current || isExporting) return;
    setIsExporting(true);
    setHasError(false);
    try {
      await exportWidgetAsPdf(ref.current, title, {
        generatedAtLabel: t('pdfGeneratedAt', { date: new Date().toLocaleString() }),
        footerLabel: t('pdfFooterAuthor', { author: APP_METADATA.author.displayName }),
      });
    } catch {
      setHasError(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`exportable-widget${className ? ` ${className}` : ''}`} ref={ref}>
      <div className="exportable-widget__toolbar" data-html-to-image-ignore="true">
        <button
          type="button"
          className="exportable-widget__export-btn"
          onClick={() => void handleExport()}
          disabled={isExporting}
          title={t('exportWidgetPdf')}
          aria-label={t('exportWidgetPdf')}
        >
          PDF
        </button>
      </div>
      {hasError ? <p className="exportable-widget__error">{t('pdfExportError')}</p> : null}
      {children}
    </div>
  );
}
