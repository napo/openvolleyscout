import { useTranslation, type TranslationKey } from '@src/i18n';
import './input-level-chooser.css';

export type InputLevel = 'tag' | 'court' | 'detailed';

const LEVELS: ReadonlyArray<{ level: InputLevel; labelKey: TranslationKey; hintKey: TranslationKey; warningKey?: TranslationKey }> = [
  { level: 'court', labelKey: 'inputModeCourt', hintKey: 'inputModeCourtHint' },
  { level: 'detailed', labelKey: 'inputModeDetailed', hintKey: 'inputModeDetailedHint' },
  { level: 'tag', labelKey: 'inputModeTag', hintKey: 'inputModeTagHint', warningKey: 'inputLevelTagWarning' },
];

interface InputLevelChooserProps {
  recommended: InputLevel;
  onChoose: (level: InputLevel) => void;
}

/**
 * Asked once, the first time live scouting opens: how much detail the scout
 * wants to enter. The court stays the default; Tags is an extra, lighter way
 * in. The choice can be changed at any time from the scouting header.
 */
export function InputLevelChooser({ recommended, onChoose }: InputLevelChooserProps) {
  const { t } = useTranslation();

  return (
    <div className="input-level-chooser" role="dialog" aria-modal="true" aria-labelledby="input-level-chooser-title">
      <div className="input-level-chooser__backdrop" />
      <section className="input-level-chooser__panel">
        <h2 id="input-level-chooser-title" className="input-level-chooser__title">{t('inputLevelChooserTitle')}</h2>
        <p className="input-level-chooser__description">{t('inputLevelChooserDescription')}</p>
        <div className="input-level-chooser__options">
          {LEVELS.map(({ level, labelKey, hintKey, warningKey }) => (
            <button
              key={level}
              type="button"
              className={`input-level-chooser__option${level === recommended ? ' is-recommended' : ''}`}
              onClick={() => onChoose(level)}
            >
              <span className="input-level-chooser__option-title">
                {t(labelKey)}
                {level === recommended ? (
                  <span className="input-level-chooser__badge">{t('inputLevelRecommended')}</span>
                ) : null}
              </span>
              <span className="input-level-chooser__option-hint">{t(hintKey)}</span>
              {warningKey ? <span className="input-level-chooser__option-warning">{t(warningKey)}</span> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
