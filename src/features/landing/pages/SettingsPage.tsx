import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { Locale } from '@src/i18n/locale';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { useAppStore } from '@src/app/store/app-store';
import { resetLocalData } from '@src/infrastructure/storage/reset-local-data';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { LanguageSelector } from '../components/LanguageSelector';
import {
  ATTACK_TO_DIG_EVALUATION,
  BLOCK_TO_ATTACK_EVALUATION,
  RECEIVE_TO_SERVE_EVALUATION,
} from '@src/features/scouting/model/datavolley-flow';
import {
  EVALUATION_CODES,
  useEvaluationKeyBindingsStore,
} from '@src/features/scouting/model/evaluation-keybindings-store';
import { useCourtOrientationStore } from '@src/features/scouting/model/court-orientation-store';

// Display order follows the DataVolley manuals (best to worst, then errors).
const COMPOUND_EVAL_ORDER: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];

function CompoundCodesTable({ fromLabel, toLabel, map }: {
  fromLabel: string;
  toLabel: string;
  map: Partial<Record<SkillEvaluation, SkillEvaluation>>;
}) {
  return (
    <table className="settings-page__compound-table">
      <thead>
        <tr>
          <th scope="col">{fromLabel}</th>
          <th scope="col">{toLabel}</th>
        </tr>
      </thead>
      <tbody>
        {COMPOUND_EVAL_ORDER.map((evaluation) => (
          <tr key={evaluation}>
            <td>{evaluation}</td>
            <td>{map[evaluation] ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EvaluationKeyBindingsTable() {
  const { t } = useTranslation();
  const keyBindings = useEvaluationKeyBindingsStore((state) => state.keyBindings);
  const setKeyBinding = useEvaluationKeyBindingsStore((state) => state.setKeyBinding);
  const resetKeyBindings = useEvaluationKeyBindingsStore((state) => state.resetKeyBindings);
  const [capturingCode, setCapturingCode] = useState<SkillEvaluation | null>(null);
  const [errorByCode, setErrorByCode] = useState<Partial<Record<SkillEvaluation, string>>>({});

  const handleCaptureKeyDown = (code: SkillEvaluation) => (event: React.KeyboardEvent) => {
    event.preventDefault();
    if (event.key === 'Escape') {
      setCapturingCode(null);
      return;
    }
    if (event.key.length !== 1) {
      return;
    }

    const result = setKeyBinding(code, event.key);
    if (result.ok) {
      setErrorByCode((prev) => ({ ...prev, [code]: undefined }));
      setCapturingCode(null);
    } else {
      setErrorByCode((prev) => ({
        ...prev,
        [code]: result.reason === 'digit' ? t('keyBindingsDigitError') : t('keyBindingsDuplicateError'),
      }));
    }
  };

  return (
    <div>
      <table className="settings-page__compound-table">
        <thead>
          <tr>
            <th scope="col">{t('keyBindingsCodeColumn')}</th>
            <th scope="col">{t('keyBindingsKeyColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {EVALUATION_CODES.map((code) => (
            <tr key={code}>
              <td>{code}</td>
              <td>
                <button
                  type="button"
                  className="settings-page__keybinding-button"
                  onClick={() => setCapturingCode(code)}
                  onBlur={() => setCapturingCode((current) => (current === code ? null : current))}
                  onKeyDown={capturingCode === code ? handleCaptureKeyDown(code) : undefined}
                >
                  {capturingCode === code ? t('keyBindingsPressKeyPrompt') : keyBindings[code]}
                </button>
                {errorByCode[code] ? (
                  <p className="settings-page__keybinding-error">{errorByCode[code]}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="settings-page__keybinding-reset"
        onClick={() => {
          resetKeyBindings();
          setErrorByCode({});
          setCapturingCode(null);
        }}
      >
        {t('keyBindingsResetAll')}
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const closeProject = useAppStore((state) => state.closeProject);
  const showDebugSubzones = useAppStore((state) => state.showDebugSubzones);
  const setShowDebugSubzones = useAppStore((state) => state.setShowDebugSubzones);
  const hideImportWarnings = useAppStore((state) => state.hideImportWarnings);
  const setHideImportWarnings = useAppStore((state) => state.setHideImportWarnings);
  const toolbarScale = useAppStore((state) => state.toolbarScale);
  const setToolbarScale = useAppStore((state) => state.setToolbarScale);
  const markerScale = useAppStore((state) => state.markerScale);
  const setMarkerScale = useAppStore((state) => state.setMarkerScale);
  const confirmPointAssignment = useAppStore((state) => state.confirmPointAssignment);
  const setConfirmPointAssignment = useAppStore((state) => state.setConfirmPointAssignment);
  const courtOrientation = useCourtOrientationStore((state) => state.orientation);
  const setCourtOrientation = useCourtOrientationStore((state) => state.setOrientation);

  const handleResetLocalData = async () => {
    const confirmed = window.confirm(t('resetLocalDataConfirmation'));
    if (!confirmed) {
      return;
    }

    try {
      await resetLocalData();
      closeProject();
      window.location.assign('/');
    } catch (error) {
      console.error('Error resetting local data:', error);
    }
  };

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--narrow">
        <AppPageLayout
          className="app-page-card"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content settings-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('settings')}</h1>
            </div>
          )}
        >

          <section className="settings-page__section">
            <label className="form-label">
              {t('selectLanguage')}
            </label>
            <LanguageSelector
              value={locale}
              onChange={setLocale}
            />
          </section>

          <section className="settings-page__section">
            <label className="form-label">
              {t('toolbarSize')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min="1"
                max="2"
                step="0.1"
                value={toolbarScale}
                onChange={(e) => setToolbarScale(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: '2.5rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {toolbarScale.toFixed(1)}×
              </span>
            </div>
          </section>

          <section className="settings-page__section">
            <label className="form-label">
              {t('markerSize')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.1"
                value={markerScale}
                onChange={(e) => setMarkerScale(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: '2.5rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {markerScale.toFixed(1)}×
              </span>
            </div>
          </section>

          <section className="settings-page__section">
            <h2 className="settings-page__section-title">{t('scoutingSettingsTitle')}</h2>
            <label className="settings-page__checkbox-label">
              <input
                type="checkbox"
                checked={confirmPointAssignment}
                onChange={(e) => setConfirmPointAssignment(e.target.checked)}
              />
              {t('confirmPointAssignmentLabel')}
            </label>
            <p className="settings-page__text">{t('confirmPointAssignmentDescription')}</p>
            <label className="settings-page__checkbox-label">
              <input
                type="checkbox"
                checked={courtOrientation === 'vertical'}
                onChange={(e) => setCourtOrientation(e.target.checked ? 'vertical' : 'horizontal')}
              />
              {t('verticalCourtOrientationLabel')}
            </label>
            <p className="settings-page__text">{t('verticalCourtOrientationDescription')}</p>
          </section>

          <section className="settings-page__section">
            <h2 className="settings-page__section-title">{t('compoundCodesTitle')}</h2>
            <p className="settings-page__text">{t('compoundCodesDescription')}</p>
            <div className="settings-page__compound-tables">
              <CompoundCodesTable
                fromLabel={t('skillReceive')}
                toLabel={t('skillServe')}
                map={RECEIVE_TO_SERVE_EVALUATION}
              />
              <CompoundCodesTable
                fromLabel={t('skillBlock')}
                toLabel={t('skillAttack')}
                map={BLOCK_TO_ATTACK_EVALUATION}
              />
              <CompoundCodesTable
                fromLabel={t('skillAttack')}
                toLabel={t('skillDig')}
                map={ATTACK_TO_DIG_EVALUATION}
              />
            </div>
            <p className="settings-page__text">{t('compoundCodesNotes')}</p>
          </section>

          <section className="settings-page__section">
            <h2 className="settings-page__section-title">{t('keyBindingsTitle')}</h2>
            <p className="settings-page__text">{t('keyBindingsDescription')}</p>
            <EvaluationKeyBindingsTable />
          </section>

          {import.meta.env.DEV ? (
            <section className="settings-page__section">
              <h2 className="settings-page__section-title">Debug</h2>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={showDebugSubzones}
                  onChange={(e) => setShowDebugSubzones(e.target.checked)}
                />
                {t('showDebugSubzones')}
              </label>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={hideImportWarnings}
                  onChange={(e) => setHideImportWarnings(e.target.checked)}
                />
                {t('hideImportWarnings')}
              </label>
            </section>
          ) : null}

          {import.meta.env.DEV ? (
            <section className="settings-page__danger-zone">
              <p className="settings-page__eyebrow">{t('developmentOnly')}</p>
              <h2 className="settings-page__section-title">{t('resetLocalData')}</h2>
              <p className="settings-page__text">{t('resetLocalDataDescription')}</p>
              <button
                type="button"
                className="settings-page__danger-button"
                onClick={handleResetLocalData}
              >
                {t('resetLocalData')}
              </button>
            </section>
          ) : null}
        </AppPageLayout>
      </div>
    </main>
  );
}
