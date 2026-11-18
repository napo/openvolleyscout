// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type {
  SetterDistributionReceptionBand,
  SetterDistributionServeType,
  SetterDistributionViewConfig,
} from '@src/domain/opponent-report/types';

const SERVE_TYPES: ReadonlyArray<{ value: SetterDistributionServeType; labelKey: 'setterViewServeJumpSpin' | 'setterViewServeJumpFloat' | 'setterViewServeFloat' | 'setterViewServeOther' }> = [
  { value: 'jump_spin', labelKey: 'setterViewServeJumpSpin' },
  { value: 'jump_float', labelKey: 'setterViewServeJumpFloat' },
  { value: 'float', labelKey: 'setterViewServeFloat' },
  { value: 'other', labelKey: 'setterViewServeOther' },
];

const START_ZONES = ['1', '6', '5', '2', '3', '4'] as const;

const RECEPTION_BANDS: ReadonlyArray<{ value: SetterDistributionReceptionBand; labelKey: 'setterViewReceptionAll' | 'setterViewReceptionPositive' | 'setterViewReceptionNegative' }> = [
  { value: 'all', labelKey: 'setterViewReceptionAll' },
  { value: 'positive', labelKey: 'setterViewReceptionPositive' },
  { value: 'negative', labelKey: 'setterViewReceptionNegative' },
];

interface SetterViewsEditorProps {
  views: readonly SetterDistributionViewConfig[] | undefined;
  onChange: (nextViews: SetterDistributionViewConfig[] | undefined) => void;
}

export function SetterViewsEditor({ views, onChange }: SetterViewsEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const defaultViews = (): SetterDistributionViewConfig[] => [
    { id: 'positive', label: t('opponentReportSetterPositiveBand'), receptionBand: 'positive' },
    { id: 'negative', label: t('opponentReportSetterNegativeBand'), receptionBand: 'negative' },
  ];

  const activeViews: SetterDistributionViewConfig[] = views && views.length > 0 ? [...views] : defaultViews();

  const patchView = (index: number, patch: Partial<SetterDistributionViewConfig>) => {
    const next = activeViews.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange(next);
  };

  const toggleServeType = (index: number, serveType: SetterDistributionServeType) => {
    const current = activeViews[index].serveTypes ?? [];
    const next = current.includes(serveType)
      ? current.filter((item) => item !== serveType)
      : [...current, serveType];
    patchView(index, { serveTypes: next.length > 0 ? next : undefined });
  };

  const toggleStartZone = (index: number, zone: string) => {
    const current = activeViews[index].serveStartZones ?? [];
    const next = current.includes(zone)
      ? current.filter((item) => item !== zone)
      : [...current, zone];
    patchView(index, { serveStartZones: next.length > 0 ? next : undefined });
  };

  const addView = (base?: SetterDistributionViewConfig) => {
    const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const entry: SetterDistributionViewConfig = base
      ? {
          ...base,
          id,
          label: `${base.label} (${activeViews.length + 1})`,
          serveTypes: base.serveTypes ? [...base.serveTypes] : undefined,
          serveStartZones: base.serveStartZones ? [...base.serveStartZones] : undefined,
        }
      : {
          id,
          label: t('setterViewNewLabel', { n: activeViews.length + 1 }),
          receptionBand: 'all',
        };
    onChange([...activeViews, entry]);
  };

  const removeView = (index: number) => {
    if (activeViews.length <= 1) return;
    onChange(activeViews.filter((_, i) => i !== index));
  };

  const moveView = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= activeViews.length) return;
    const next = [...activeViews];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <div className="setter-views-editor">
      <div className="setter-views-editor__header">
        <button
          type="button"
          className="btn-secondary btn-small"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {t('setterViewsConfigure')} ({activeViews.length})
        </button>
        {views && views.length > 0 ? (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => onChange(undefined)}
          >
            {t('setterViewsResetDefault')}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="setter-views-editor__body">
          <p className="opponent-report__hint">{t('setterViewsHint')}</p>
          <div className="setter-views-editor__list">
            {activeViews.map((view, index) => (
              <div key={view.id} className="setter-views-editor__card">
                <div className="setter-views-editor__row">
                  <label className="setter-views-editor__label-field">
                    <span>{t('setterViewLabel')}</span>
                    <input
                      type="text"
                      value={view.label}
                      onChange={(event) => patchView(index, { label: event.target.value })}
                    />
                  </label>
                  <div className="setter-views-editor__actions">
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === 0}
                      onClick={() => moveView(index, -1)}
                      title={t('setterViewMoveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={index === activeViews.length - 1}
                      onClick={() => moveView(index, 1)}
                      title={t('setterViewMoveDown')}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => addView(view)}
                    >
                      {t('setterViewDuplicate')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={activeViews.length <= 1}
                      onClick={() => removeView(index)}
                    >
                      {t('setterViewDelete')}
                    </button>
                  </div>
                </div>

                <div className="setter-views-editor__filters">
                  <div className="setter-views-editor__group">
                    <span className="setter-views-editor__group-title">{t('setterViewReceptionLabel')}</span>
                    <div className="setter-views-editor__chips">
                      {RECEPTION_BANDS.map((band) => (
                        <button
                          key={band.value}
                          type="button"
                          className={`setter-views-editor__chip${view.receptionBand === band.value ? ' is-active' : ''}`}
                          aria-pressed={view.receptionBand === band.value}
                          onClick={() => patchView(index, { receptionBand: band.value })}
                        >
                          {t(band.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="setter-views-editor__group">
                    <span className="setter-views-editor__group-title">{t('setterViewServeTypeLabel')}</span>
                    <div className="setter-views-editor__chips">
                      <button
                        type="button"
                        className={`setter-views-editor__chip${!view.serveTypes?.length ? ' is-active' : ''}`}
                        aria-pressed={!view.serveTypes?.length}
                        onClick={() => patchView(index, { serveTypes: undefined })}
                      >
                        {t('setterViewFilterAll')}
                      </button>
                      {SERVE_TYPES.map((st) => {
                        const active = Boolean(view.serveTypes?.includes(st.value));
                        return (
                          <button
                            key={st.value}
                            type="button"
                            className={`setter-views-editor__chip${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => toggleServeType(index, st.value)}
                          >
                            {t(st.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="setter-views-editor__group">
                    <span className="setter-views-editor__group-title">{t('setterViewServeStartLabel')}</span>
                    <div className="setter-views-editor__chips">
                      <button
                        type="button"
                        className={`setter-views-editor__chip${!view.serveStartZones?.length ? ' is-active' : ''}`}
                        aria-pressed={!view.serveStartZones?.length}
                        onClick={() => patchView(index, { serveStartZones: undefined })}
                      >
                        {t('setterViewFilterAll')}
                      </button>
                      {START_ZONES.map((zone) => {
                        const active = Boolean(view.serveStartZones?.includes(zone));
                        return (
                          <button
                            key={zone}
                            type="button"
                            className={`setter-views-editor__chip${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => toggleStartZone(index, zone)}
                          >
                            Z{zone}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="setter-views-editor__footer">
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => addView()}
            >
              + {t('setterViewsAdd')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
