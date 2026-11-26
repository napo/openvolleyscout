import { useState, type KeyboardEvent } from 'react';
import { AppearanceSetting } from './AppearanceSetting';
import { EfficiencySettings } from './EfficiencySettings';
import { ScoreSituationSettings } from './ScoreSituationSettings';
import { CloudSyncDeviceSettings } from '@src/features/sync/cloud/CloudSyncDeviceSettings';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n/translations';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { useAppStore } from '@src/app/store/app-store';
import { resetLocalData } from '@src/infrastructure/storage/reset-local-data';
import { matchRepository } from '@src/infrastructure/repositories';
import { repairTouchIdCollisions } from '@src/features/scouting/model/touch-id-repair';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { LanguageSelector } from '../components/LanguageSelector';
import '@src/components/layout/tabbed-page.css';
import './settings-page.css';
import { OpponentReportThresholdsSettings } from '@src/features/opponent-reports/pages/ThresholdsSettings';
import {
  ATTACK_TO_DIG_EVALUATION,
  BLOCK_TO_ATTACK_EVALUATION,
  RECEIVE_TO_SERVE_EVALUATION,
} from '@src/features/scouting/model/datavolley-flow';
import {
  EVALUATION_CODES,
  useEvaluationKeyBindingsStore,
} from '@src/features/scouting/model/evaluation-keybindings-store';
import { useVideoShortcutStore } from '@src/features/scouting/live/video/video-shortcut-store';
import {
  formatVideoShortcut,
  videoShortcutFromEvent,
} from '@src/features/scouting/live/video/video-shortcut';
import {
  TRENDS_FEATURE_IDS,
  useExperimentalFeaturesStore,
  type TrendsFeatureId,
} from '@src/app/store/experimental-features-store';
import { confirmAction } from '@src/components/confirm-dialog';

// Display order follows the DataVolley manuals (best to worst, then errors).
const COMPOUND_EVAL_ORDER: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];

const TRENDS_FEATURE_LABEL_KEY: Record<TrendsFeatureId, TranslationKey> = {
  similarity: 'similarityTitle',
  competition: 'competitionComparisonTab',
  'rally-model': 'rallyModelTab',
};

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
            <td>{map[evaluation] ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);

function VideoShortcutSetting() {
  const { t } = useTranslation();
  const shortcut = useVideoShortcutStore((state) => state.shortcut);
  const setShortcut = useVideoShortcutStore((state) => state.setShortcut);
  const resetShortcut = useVideoShortcutStore((state) => state.resetShortcut);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState(false);

  const handleCaptureKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault();
    if (event.key === 'Escape') {
      setCapturing(false);
      return;
    }
    // Wait for the actual key while only modifiers are held down.
    if (MODIFIER_KEYS.has(event.key)) return;
    const accepted = setShortcut(videoShortcutFromEvent(event.nativeEvent));
    setError(!accepted);
    if (accepted) setCapturing(false);
  };

  return (
    <div>
      <button
        type="button"
        className="settings-page__keybinding-button"
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={capturing ? handleCaptureKeyDown : undefined}
      >
        {capturing ? t('keyBindingsPressKeyPrompt') : formatVideoShortcut(shortcut)}
      </button>
      {error ? <p className="settings-page__keybinding-error">{t('videoShortcutModifierError')}</p> : null}
      <button
        type="button"
        className="settings-page__keybinding-reset"
        onClick={() => {
          resetShortcut();
          setError(false);
          setCapturing(false);
        }}
      >
        {t('keyBindingsResetAll')}
      </button>
    </div>
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

const SETTINGS_TABS = [
  ['settingsTabDisplay', 'display'],
  ['scoutingSettingsTitle', 'scouting'],
  ['settingsTabShortcuts', 'shortcuts'],
  ['analysis', 'analysis'],
  ['cloudSyncTitle', 'sync'],
  ['settingsTabExperimental', 'experimental'],
  ['settingsMaintenanceTitle', 'maintenance'],
] as const;
type SettingsTab = typeof SETTINGS_TABS[number][1];

export function SettingsPage() {
  const { t, locale, setLocale } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: SettingsTab = SETTINGS_TABS.find(([, id]) => id === searchParams.get('tab'))?.[1] ?? 'display';
  const selectTab = (id: SettingsTab) => setSearchParams({ tab: id }, { replace: true });
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % SETTINGS_TABS.length; break;
      case 'ArrowLeft': nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = SETTINGS_TABS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    selectTab(SETTINGS_TABS[nextIndex][1]);
    document.getElementById(`settings-tab-${SETTINGS_TABS[nextIndex][1]}`)?.focus();
  };
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
  const simpleInput = useAppStore((state) => state.simpleInput);
  const setSimpleInput = useAppStore((state) => state.setSimpleInput);
  const feedbackSound = useAppStore((state) => state.feedbackSound);
  const setFeedbackSound = useAppStore((state) => state.setFeedbackSound);
  const setConfirmPointAssignment = useAppStore((state) => state.setConfirmPointAssignment);
  const liberoAutoMiddleReplacement = useAppStore((state) => state.liberoAutoMiddleReplacement);
  const setLiberoAutoMiddleReplacement = useAppStore((state) => state.setLiberoAutoMiddleReplacement);
  const trendsFeatures = useExperimentalFeaturesStore((state) => state.trendsFeatures);
  const setTrendsFeatureEnabled = useExperimentalFeaturesStore((state) => state.setTrendsFeatureEnabled);
  const scoutingFeatures = useExperimentalFeaturesStore((state) => state.scoutingFeatures);
  const setScoutingFeatureEnabled = useExperimentalFeaturesStore((state) => state.setScoutingFeatureEnabled);
  const [touchIdRepairStatus, setTouchIdRepairStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [touchIdRepairSummary, setTouchIdRepairSummary] = useState<{ fixedTouches: number; fixedMatches: number } | null>(null);

  const handleRepairTouchIdCollisions = async () => {
    setTouchIdRepairStatus('running');
    setTouchIdRepairSummary(null);

    try {
      const projects = await matchRepository.list();
      let fixedTouches = 0;
      let fixedMatches = 0;

      for (const project of projects) {
        const { project: repaired, fixedCount } = repairTouchIdCollisions(project);
        if (fixedCount > 0) {
          await matchRepository.update(repaired);
          fixedTouches += fixedCount;
          fixedMatches += 1;
        }
      }

      setTouchIdRepairSummary({ fixedTouches, fixedMatches });
    } catch (error) {
      console.error('Error repairing touch ID collisions:', error);
      setTouchIdRepairSummary(null);
    } finally {
      setTouchIdRepairStatus('done');
    }
  };

  const handleResetLocalData = async () => {
    const confirmed = await confirmAction(t('resetLocalDataConfirmation'));
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
    <div className="app-page-screen tabbed-page settings-page">
      <div className="app-page-screen__container">
        <AppPageLayout
          className="app-page-card tabbed-page__layout"
          headerClassName="app-page-card__header tabbed-page__header"
          contentClassName="app-page-card__content tabbed-page__content settings-page__content"
          header={<h1 className="app-page-card__title">{t('settings')}</h1>}
        >
          <div className="tabbed-page__tabs" role="tablist" aria-label={t('settingsIndexLabel')}>
            {SETTINGS_TABS.map(([key, id], index) => (
              <button
                key={id}
                id={`settings-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`settings-panel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => selectTab(id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div
            id="settings-panel-display"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-display"
            tabIndex={0}
            hidden={activeTab !== 'display'}
          >
            <section className="settings-page__section" id="settings-display">
              <h2 className="settings-page__section-title">{t('settingsDisplayTitle')}</h2>
              <label className="form-label">
                {t('selectLanguage')}
              </label>
              <LanguageSelector
                value={locale}
                onChange={setLocale}
              />
            </section>
            <AppearanceSetting />
            <section className="settings-page__section">
              <label className="form-label" htmlFor="settings-toolbar-size">
                {t('toolbarSize')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="settings-toolbar-size"
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
              <label className="form-label" htmlFor="settings-marker-size">
                {t('markerSize')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="settings-marker-size"
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
          </div>
          <div
            id="settings-panel-scouting"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-scouting"
            tabIndex={0}
            hidden={activeTab !== 'scouting'}
          >
            <section className="settings-page__section" id="settings-scouting">
              <h2 className="settings-page__section-title">{t('scoutingSettingsTitle')}</h2>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={simpleInput}
                  onChange={(e) => setSimpleInput(e.target.checked)}
                />
                {t('simpleInputLabel')}
              </label>
              <p className="settings-page__text">{t('simpleInputDescription')}</p>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={feedbackSound}
                  onChange={(e) => setFeedbackSound(e.target.checked)}
                />
                {t('feedbackSoundLabel')}
              </label>
              <p className="settings-page__text">{t('feedbackSoundDescription')}</p>
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
                  checked={liberoAutoMiddleReplacement}
                  onChange={(e) => setLiberoAutoMiddleReplacement(e.target.checked)}
                />
                {t('liberoReplacesMiddlesByDefault')}
              </label>
              <p className="settings-page__text">{t('liberoAutoMiddleReplacementDescription')}</p>
            </section>
            <section className="settings-page__section" id="settings-compound">
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
          </div>
          <div
            id="settings-panel-shortcuts"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-shortcuts"
            tabIndex={0}
            hidden={activeTab !== 'shortcuts'}
          >
            <section className="settings-page__section" id="settings-keys">
              <h2 className="settings-page__section-title">{t('keyBindingsTitle')}</h2>
              <p className="settings-page__text">{t('keyBindingsDescription')}</p>
              <EvaluationKeyBindingsTable />
            </section>
            <section className="settings-page__section" id="settings-video">
              <h2 className="settings-page__section-title">{t('videoShortcutTitle')}</h2>
              <p className="settings-page__text">{t('videoShortcutDescription')}</p>
              <VideoShortcutSetting />
            </section>
          </div>
          <div
            id="settings-panel-analysis"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-analysis"
            tabIndex={0}
            hidden={activeTab !== 'analysis'}
          >
            <EfficiencySettings />
            <ScoreSituationSettings />
            <OpponentReportThresholdsSettings />
          </div>
          <div
            id="settings-panel-experimental"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-experimental"
            tabIndex={0}
            hidden={activeTab !== 'experimental'}
          >
            <section className="settings-page__section" id="settings-experimental">
              <h2 className="settings-page__section-title">{t('experimentalSettingsTitle')}</h2>
              <p className="settings-page__text">{t('experimentalSettingsDescription')}</p>
              <label className="settings-page__checkbox-label">
                <input
                  type="checkbox"
                  checked={scoutingFeatures['predict-attacker']}
                  onChange={(e) => setScoutingFeatureEnabled('predict-attacker', e.target.checked)}
                />
                {t('experimentalPredictAttacker')}
              </label>
              <p className="settings-page__text">{t('experimentalPredictAttackerDescription')}</p>
              <p className="settings-page__text">{t('experimentalTrendsDescription')}</p>
              {TRENDS_FEATURE_IDS.map((id) => (
                <label key={id} className="settings-page__checkbox-label">
                  <input
                    type="checkbox"
                    checked={trendsFeatures[id]}
                    onChange={(e) => setTrendsFeatureEnabled(id, e.target.checked)}
                  />
                  {t(TRENDS_FEATURE_LABEL_KEY[id])}
                </label>
              ))}
            </section>
          </div>
          <div
            id="settings-panel-sync"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-sync"
            tabIndex={0}
            hidden={activeTab !== 'sync'}
          >
            <CloudSyncDeviceSettings />
          </div>
          <div
            id="settings-panel-maintenance"
            className="tabbed-page__panel settings-page__panel"
            role="tabpanel"
            aria-labelledby="settings-tab-maintenance"
            tabIndex={0}
            hidden={activeTab !== 'maintenance'}
          >
            <section className="settings-page__section" id="settings-maintenance">
              <h2 className="settings-page__section-title">{t('settingsMaintenanceTitle')}</h2>
              {import.meta.env.DEV ? (
                <>
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
                </>
              ) : null}
              <p className="settings-page__text">{t('repairTouchIdCollisionsDescription')}</p>
              <button
                type="button"
                className="btn-secondary"
                disabled={touchIdRepairStatus === 'running'}
                onClick={() => void handleRepairTouchIdCollisions()}
              >
                {touchIdRepairStatus === 'running' ? t('repairTouchIdCollisionsRunning') : t('repairTouchIdCollisionsAction')}
              </button>
              {touchIdRepairStatus === 'done' && (
                <p className="settings-page__text">
                  {touchIdRepairSummary
                    ? (touchIdRepairSummary.fixedTouches > 0
                      ? t('repairTouchIdCollisionsResult', {
                        touches: touchIdRepairSummary.fixedTouches,
                        matches: touchIdRepairSummary.fixedMatches,
                      })
                      : t('repairTouchIdCollisionsNoneFound'))
                    : t('repairTouchIdCollisionsError')}
                </p>
              )}
            </section>
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
          </div>
        </AppPageLayout>
      </div>
    </div>
  );
}
