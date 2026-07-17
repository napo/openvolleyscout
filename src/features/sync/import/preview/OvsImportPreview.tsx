import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { ConfirmOvsImportOptions, NoCommonBaseChoice, OvsImportPreview as OvsImportPreviewModel } from './types';

interface OvsImportPreviewProps {
  preview: OvsImportPreviewModel;
  fileName?: string;
  isImporting?: boolean;
  onConfirm: (options: ConfirmOvsImportOptions) => void;
  onCancel: () => void;
}

export function OvsImportPreview({ preview, fileName, isImporting = false, onConfirm, onCancel }: OvsImportPreviewProps) {
  const { t } = useTranslation();
  const [noCommonBaseChoice, setNoCommonBaseChoice] = useState<NoCommonBaseChoice>('keep_local');
  const [divergenceResolutions, setDivergenceResolutions] = useState<Record<number, 'local' | 'remote'>>({});

  // Derived strictly from `result.status`/`blockedReason`, not from whether
  // `divergenceConflicts` happens to be non-empty — that array is also empty
  // for the OTHER blocked reason (`unreplayable_sequence`), which previously
  // made this vacuously look "ready to confirm".
  const isMergeBlocked = preview.kind === 'merge' && preview.result.status === 'blocked';
  const isBlockedOnDivergence = isMergeBlocked && preview.result.blockedReason === 'open_set_divergence';
  const isBlockedUnreplayable = isMergeBlocked && preview.result.blockedReason === 'unreplayable_sequence';
  const divergenceConflicts = isBlockedOnDivergence ? preview.result.divergenceConflicts : [];
  const allDivergencesResolved = divergenceConflicts.every((conflict) => divergenceResolutions[conflict.setNumber]);
  const metaConflicts = preview.kind === 'merge' && preview.result.status === 'merged' ? preview.result.conflicts : [];

  const canConfirm =
    !isImporting &&
    (preview.kind !== 'merge' || preview.result.status === 'merged' || (isBlockedOnDivergence && allDivergencesResolved));

  function handleConfirm() {
    onConfirm({ noCommonBaseChoice, divergenceResolutions });
  }

  return (
    <section className="datavolley-import-preview" aria-label={t('ovsImportPreview')}>
      <div className="datavolley-import-preview__header">
        <div>
          <h2 className="datavolley-import-preview__title">{t('ovsImportPreview')}</h2>
          {fileName ? <p className="datavolley-import-preview__file">{fileName}</p> : null}
        </div>
      </div>

      {preview.kind === 'new_match' ? <p>{t('ovsNewMatchImport')}</p> : null}

      {preview.kind === 'no_common_base' ? (
        <div>
          <p>{t('ovsNoCommonBase')}</p>
          <label>
            <input
              type="radio"
              name="ovs-no-common-base-choice"
              checked={noCommonBaseChoice === 'keep_local'}
              onChange={() => setNoCommonBaseChoice('keep_local')}
            />
            {t('ovsKeepLocal')}
          </label>
          <label>
            <input
              type="radio"
              name="ovs-no-common-base-choice"
              checked={noCommonBaseChoice === 'use_remote'}
              onChange={() => setNoCommonBaseChoice('use_remote')}
            />
            {t('ovsUseRemote')}
          </label>
        </div>
      ) : null}

      {preview.kind === 'merge' && isBlockedOnDivergence ? (
        <div className="ovs-import-preview__divergence-list">
          {divergenceConflicts.map((conflict) => (
            <article key={conflict.setNumber} className="ovs-import-preview__divergence">
              <strong>{t('ovsDivergenceTitle', { setNumber: conflict.setNumber })}</strong>
              <p>{t('ovsDivergenceDescription')}</p>
              <label>
                <input
                  type="radio"
                  name={`ovs-divergence-${conflict.setNumber}`}
                  checked={divergenceResolutions[conflict.setNumber] === 'local'}
                  onChange={() =>
                    setDivergenceResolutions((prev) => ({ ...prev, [conflict.setNumber]: 'local' }))
                  }
                />
                {t('ovsKeepThisDevice')}
              </label>
              <label>
                <input
                  type="radio"
                  name={`ovs-divergence-${conflict.setNumber}`}
                  checked={divergenceResolutions[conflict.setNumber] === 'remote'}
                  onChange={() =>
                    setDivergenceResolutions((prev) => ({ ...prev, [conflict.setNumber]: 'remote' }))
                  }
                />
                {t('ovsKeepOtherDevice')}
              </label>
            </article>
          ))}
        </div>
      ) : null}

      {isBlockedUnreplayable ? <p>{t('ovsImportBlocked')}</p> : null}

      {preview.kind === 'merge' && preview.result.status === 'merged' ? (
        <p>{metaConflicts.length > 0 ? t('ovsMergeConflicts', { count: metaConflicts.length }) : t('ovsMergeReady')}</p>
      ) : null}

      <div className="datavolley-import-preview__actions">
        <button type="button" className="btn-secondary btn-small" onClick={onCancel} disabled={isImporting}>
          {t('cancelImport')}
        </button>
        <button type="button" className="btn-primary btn-small" onClick={handleConfirm} disabled={!canConfirm}>
          {isImporting ? t('importingDataVolley') : t('confirmImport')}
        </button>
      </div>
    </section>
  );
}
