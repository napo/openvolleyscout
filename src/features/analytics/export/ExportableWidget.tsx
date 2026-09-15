import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@src/i18n';
import { APP_METADATA } from '@src/lib/constants/app';
import { exportWidgetAsPdf } from './widget-pdf-export';
import { useWidgetExportRegistry } from './widget-export-registry';
import './widget-export.css';

export interface ExportableWidgetProps {
  /** Stable id within the tab — used by the per-tab aggregate export. */
  id: string;
  title: string;
  /** Preserves whatever outer class the widget used before wrapping (e.g. "perf-dashboard__section"). */
  className?: string;
  children: ReactNode;
}

/**
 * Wraps an analytics widget with a "export as PDF" button and registers it
 * with the enclosing tab's export registry (if any), so it can also be
 * included in a per-tab aggregate export. Purely additive: the wrapped
 * widget's own markup/behavior is unchanged.
 */
export function ExportableWidget({ id, title, className, children }: ExportableWidgetProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const registry = useWidgetExportRegistry();
  const [isExporting, setIsExporting] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!registry) return undefined;
    registry.register({ id, title, ref });
    return () => registry.unregister(id);
  }, [registry, id, title]);

  const handleExport = async () => {
    if (!ref.current || isExporting) return;
    setIsExporting(true);
    setHasError(false);
    try {
      await exportWidgetAsPdf(ref.current, title, {
        generatedAtLabel: t('pdfGeneratedAt', { date: new Date().toLocaleString() }),
        footerLabel: t('pdfFooterAuthor', { author: APP_METADATA.author.name }),
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
