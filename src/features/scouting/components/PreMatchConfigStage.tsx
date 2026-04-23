import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ScoutingMatchConfig } from '@src/domain/scouting/types';
import { useTranslation } from '@src/i18n';
import { validatePreMatchConfig, type PreMatchConfigFieldErrors } from '../model';

interface PreMatchConfigStageProps {
  initialConfig: ScoutingMatchConfig;
  onSave: (config: ScoutingMatchConfig) => Promise<void>;
}

export function PreMatchConfigStage({ initialConfig, onSave }: PreMatchConfigStageProps) {
  const { t } = useTranslation();
  const [formState, setFormState] = useState(initialConfig);
  const [errors, setErrors] = useState<PreMatchConfigFieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const formId = 'scouting-pre-match-config-form';

  useEffect(() => {
    setFormState(initialConfig);
    setErrors({});
  }, [initialConfig]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validatePreMatchConfig(formState);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      await onSave(formState);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="scouting-stage scouting-stage--flow scouting-stage--compact">
      <div className="scouting-stage__body scouting-stage__body--compact">
        <form id={formId} className="scouting-config scouting-config--simple" onSubmit={handleSubmit}>
          <section className="scouting-stage-panel scouting-config__panel">
            <div className="scouting-config__section-header">
              <div>
                <span className="scouting-config__section-kicker">{t('preMatchConfigRulesSection')}</span>
                <h2 className="scouting-config__section-title">{t('preMatchConfigScoringRules')}</h2>
              </div>
              <p className="scouting-config__section-text">{t('preMatchConfigScoringRulesDescription')}</p>
            </div>

            <div className="scouting-config__grid">
              <label className="scouting-config__field">
                <span className="scouting-config__label">{t('maxSetsToWin')}</span>
                <input
                  className="scouting-config__input"
                  type="number"
                  min={1}
                  max={9}
                  value={formState.maxSetsToWin}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      maxSetsToWin: Number(event.target.value),
                    }));
                  }}
                />
                {errors.maxSetsToWin && <span className="scouting-config__error">{t(errors.maxSetsToWin)}</span>}
              </label>

              <label className="scouting-config__field">
                <span className="scouting-config__label">{t('setTargetPoints')}</span>
                <input
                  className="scouting-config__input"
                  type="number"
                  min={1}
                  max={99}
                  value={formState.setTargetPoints}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      setTargetPoints: Number(event.target.value),
                    }));
                  }}
                />
                {errors.setTargetPoints && <span className="scouting-config__error">{t(errors.setTargetPoints)}</span>}
              </label>

              <label className="scouting-config__field">
                <span className="scouting-config__label">{t('tieBreakTargetPoints')}</span>
                <input
                  className="scouting-config__input"
                  type="number"
                  min={1}
                  max={99}
                  value={formState.tieBreakTargetPoints}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      tieBreakTargetPoints: Number(event.target.value),
                    }));
                  }}
                />
                {errors.tieBreakTargetPoints && <span className="scouting-config__error">{t(errors.tieBreakTargetPoints)}</span>}
              </label>

              <div className="scouting-config__field scouting-config__field--toggle">
                <span className="scouting-config__label">{t('enableGoldenSet')}</span>
                <label className="scouting-config__toggle" htmlFor="enable-golden-set">
                  <input
                    id="enable-golden-set"
                    type="checkbox"
                    checked={formState.enableGoldenSet}
                    onChange={(event) => {
                      setFormState((current) => ({
                        ...current,
                        enableGoldenSet: event.target.checked,
                      }));
                    }}
                  />
                  <span>{t('preMatchConfigEnableGoldenSetDescription')}</span>
                </label>
              </div>

              <label className="scouting-config__field">
                <span className="scouting-config__label">{t('goldenSetTargetPoints')}</span>
                <input
                  className="scouting-config__input"
                  type="number"
                  min={1}
                  max={99}
                  value={formState.goldenSetTargetPoints}
                  disabled={!formState.enableGoldenSet}
                  onChange={(event) => {
                    setFormState((current) => ({
                      ...current,
                      goldenSetTargetPoints: Number(event.target.value),
                    }));
                  }}
                />
                <span className="scouting-config__hint">
                  {formState.enableGoldenSet
                    ? t('preMatchConfigGoldenSetEnabledHint')
                    : t('preMatchConfigGoldenSetDisabledHint')}
                </span>
                {errors.goldenSetTargetPoints && (
                  <span className="scouting-config__error">{t(errors.goldenSetTargetPoints)}</span>
                )}
              </label>
            </div>
          </section>
        </form>
      </div>

      <footer className="scouting-stage__footer">
        <div className="scouting-stage__actions">
          <button type="submit" form={formId} className="btn-primary" disabled={isSaving}>
            {isSaving ? t('savingScoutingConfig') : t('confirmPreMatchConfig')}
          </button>
        </div>
      </footer>
    </section>
  );
}
