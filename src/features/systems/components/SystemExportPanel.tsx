import { useMemo, useRef, useState } from 'react';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems/types';
import { useTranslation } from '@src/i18n';
import {
  downloadTextFile,
  getSystemExportFileName,
  serializeSystemBlockToTypeScript,
} from '../utils/system-export';

type SystemExportPanelProps =
  | {
      kind: 'defense';
      block: DefenseSystemBlock;
      onClose: () => void;
    }
  | {
      kind: 'reception';
      block: ReceptionSystemBlock;
      onClose: () => void;
    };

export function SystemExportPanel({ kind, block, onClose }: SystemExportPanelProps) {
  const { t } = useTranslation();
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const code = useMemo(
    () => (
      kind === 'defense'
        ? serializeSystemBlockToTypeScript(block as DefenseSystemBlock, kind)
        : serializeSystemBlockToTypeScript(block as ReceptionSystemBlock, kind)
    ),
    [block, kind],
  );
  const fileName = useMemo(() => getSystemExportFileName(block.name, kind), [block.name, kind]);

  const selectExportCode = () => {
    textAreaRef.current?.focus();
    textAreaRef.current?.select();
  };

  const handleCopy = async () => {
    setHasCopied(false);

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        setHasCopied(true);
        return;
      } catch {
        selectExportCode();
      }
    } else {
      selectExportCode();
    }

    try {
      if (document.execCommand('copy')) {
        setHasCopied(true);
      }
    } catch {
      selectExportCode();
    }
  };

  const handleDownload = () => {
    downloadTextFile(fileName, code);
  };

  return (
    <div className="systems-export" role="dialog" aria-modal="true" aria-labelledby="systems-export-title">
      <div className="systems-export__backdrop" onClick={onClose} />
      <section className="systems-export__panel">
        <header className="systems-export__header">
          <div>
            <h3 id="systems-export-title" className="systems-export__title">
              {t('exportConfiguration')}
            </h3>
            <p className="systems-export__help">{t('exportConfigurationHelp')}</p>
          </div>
          <button type="button" className="btn-secondary btn-small systems-export__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <textarea
          ref={textAreaRef}
          className="systems-export__code"
          value={code}
          readOnly
          spellCheck={false}
          wrap="off"
          aria-label={t('exportConfiguration')}
        />

        <footer className="systems-export__footer">
          <span className="systems-export__status" aria-live="polite">
            {hasCopied ? t('configurationCopied') : ''}
          </span>
          <div className="systems-export__actions">
            <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
              {t('copyConfiguration')}
            </button>
            <button type="button" className="btn-primary" onClick={handleDownload}>
              {t('downloadConfiguration')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
