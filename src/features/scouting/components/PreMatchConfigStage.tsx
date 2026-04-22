import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ScoutingMatchConfig } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import { ScoutingStageFrame } from './ScoutingStageFrame';

interface PreMatchConfigStageProps {
  initialConfig: ScoutingMatchConfig;
  onSave: (config: ScoutingMatchConfig) => Promise<void>;
}

export function PreMatchConfigStage({ initialConfig, onSave }: PreMatchConfigStageProps) {
  const { t } = useTranslation();
  const [formState, setFormState] = useState(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormState(initialConfig);
  }, [initialConfig]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave(formState);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScoutingStageFrame
      eyebrow={t('preMatchConfigEyebrow')}
      title={t('preMatchConfigTitle')}
      description={t('preMatchConfigDescription')}
    >
      <form className="scouting-config" onSubmit={handleSubmit}>
        <div className="scouting-config__grid">
          <label className="scouting-config__field">
            <span className="scouting-config__label">{t('maxSetsToWin')}</span>
            <input
              className="scouting-config__input"
              type="number"
              min={1}
              max={7}
              value={formState.maxSetsToWin}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  maxSetsToWin: Number(event.target.value),
                }));
              }}
            />
          </label>

          <label className="scouting-config__field">
            <span className="scouting-config__label">{t('setTargetScore')}</span>
            <input
              className="scouting-config__input"
              type="number"
              min={1}
              max={99}
              value={formState.setTargetScore}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  setTargetScore: Number(event.target.value),
                }));
              }}
            />
          </label>

          <label className="scouting-config__field">
            <span className="scouting-config__label">{t('tieBreakTargetScore')}</span>
            <input
              className="scouting-config__input"
              type="number"
              min={1}
              max={99}
              value={formState.tieBreakTargetScore}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  tieBreakTargetScore: Number(event.target.value),
                }));
              }}
            />
          </label>

          <label className="scouting-config__field">
            <span className="scouting-config__label">{t('goldenSetTargetScore')}</span>
            <input
              className="scouting-config__input"
              type="number"
              min={1}
              max={99}
              value={formState.goldenSetTargetScore}
              disabled={!formState.goldenSetEnabled}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  goldenSetTargetScore: Number(event.target.value),
                }));
              }}
            />
          </label>
        </div>

        <label className="scouting-config__toggle">
          <input
            type="checkbox"
            checked={formState.goldenSetEnabled}
            onChange={(event) => {
              setFormState((current) => ({
                ...current,
                goldenSetEnabled: event.target.checked,
              }));
            }}
          />
          <span>{t('enableGoldenSet')}</span>
        </label>

        <div className="scouting-config__summary">
          <div className="scouting-stage-stat">
            <span className="scouting-stage-stat__label">{t('matchFormat')}</span>
            <strong className="scouting-stage-stat__value">{t(formState.matchFormat)}</strong>
          </div>
          <div className="scouting-stage-stat">
            <span className="scouting-stage-stat__label">{t('setsToWin')}</span>
            <strong className="scouting-stage-stat__value">{formState.maxSetsToWin}</strong>
          </div>
        </div>

        <div className="scouting-config__actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? t('savingScoutingConfig') : t('saveScoutingConfig')}
          </button>
        </div>
      </form>
    </ScoutingStageFrame>
  );
}
