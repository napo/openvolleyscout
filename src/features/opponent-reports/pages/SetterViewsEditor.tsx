// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type {
  SetterDistributionReceptionBand,
  SetterDistributionReceptionEval,
  SetterDistributionServeType,
  SetterDistributionViewConfig,
} from '@src/domain/opponent-report/types';
import type { ReportPlayer } from '../model/report-metrics';

const SERVE_TYPES: ReadonlyArray<{ value: SetterDistributionServeType; labelKey: 'setterViewServeJumpSpin' | 'setterViewServeJumpFloat' | 'setterViewServeFloat' | 'setterViewServeOther' }> = [
  { value: 'jump_spin', labelKey: 'setterViewServeJumpSpin' },
  { value: 'jump_float', labelKey: 'setterViewServeJumpFloat' },
  { value: 'float', labelKey: 'setterViewServeFloat' },
  { value: 'other', labelKey: 'setterViewServeOther' },
];

/** DataVolley serve start zones behind the end line (only back-row 1, 6, 5). */
const SERVE_START_ZONES = ['1', '6', '5'] as const;
/** DataVolley reception arrival zones (deep 1/6/5, intermediate 9/8/7, short 2/3/4). */
const RECEPTION_ZONES = ['1', '6', '5', '9', '8', '7', '2', '3', '4'] as const;

const RECEPTION_BANDS: ReadonlyArray<{ value: SetterDistributionReceptionBand; labelKey: 'setterViewReceptionAll' | 'setterViewReceptionPositive' | 'setterViewReceptionNegative' }> = [
  { value: 'all', labelKey: 'setterViewReceptionAll' },
  { value: 'positive', labelKey: 'setterViewReceptionPositive' },
  { value: 'negative', labelKey: 'setterViewReceptionNegative' },
];

const RECEPTION_EVALS: readonly SetterDistributionReceptionEval[] = ['#', '+', '!', '-'];

function getEffectiveReceptionEvals(view: SetterDistributionViewConfig): SetterDistributionReceptionEval[] {
  if (view.receptionEvaluations && view.receptionEvaluations.length > 0) {
    return [...view.receptionEvaluations];
  }
  if (view.receptionBand === 'positive') return ['#', '+'];
  if (view.receptionBand === 'negative') return ['!', '-'];
  return [...RECEPTION_EVALS];
}

interface SetterViewsEditorProps {
  views: readonly SetterDistributionViewConfig[] | undefined;
  receivers?: readonly ReportPlayer[];
  onChange: (nextViews: SetterDistributionViewConfig[] | undefined) => void;
}

export function SetterViewsEditor({ views, receivers = [], onChange }: SetterViewsEditorProps) {
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

  const toggleReceptionEval = (index: number, evalCode: SetterDistributionReceptionEval) => {
    const current = getEffectiveReceptionEvals(activeViews[index]);
    const nextSet = new Set<SetterDistributionReceptionEval>(current);
    if (nextSet.has(evalCode)) {
      nextSet.delete(evalCode);
    } else {
      nextSet.add(evalCode);
    }
    const ordered = RECEPTION_EVALS.filter((code) => nextSet.has(code));
    if (ordered.length === 0 || ordered.length === RECEPTION_EVALS.length) {
      patchView(index, { receptionBand: 'all', receptionEvaluations: undefined });
      return;
    }
    if (ordered.length === 2 && ordered[0] === '#' && ordered[1] === '+') {
      patchView(index, { receptionBand: 'positive', receptionEvaluations: undefined });
      return;
    }
    if (ordered.length === 2 && ordered[0] === '!' && ordered[1] === '-') {
      patchView(index, { receptionBand: 'negative', receptionEvaluations: undefined });
      return;
    }
    patchView(index, { receptionBand: 'all', receptionEvaluations: ordered });
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

  const toggleReceptionZone = (index: number, zone: string) => {
    const current = activeViews[index].receptionZones ?? [];
    const next = current.includes(zone)
      ? current.filter((item) => item !== zone)
      : [...current, zone];
    patchView(index, { receptionZones: next.length > 0 ? next : undefined });
  };

  const toggleReceiverKey = (index: number, key: string) => {
    const current = activeViews[index].receiverKeys ?? [];
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    patchView(index, { receiverKeys: next.length > 0 ? next : undefined });
  };

  const addView = (base?: SetterDistributionViewConfig) => {
    const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const entry: SetterDistributionViewConfig = base
      ? {
          ...base,
          id,
          label: `${base.label} (${activeViews.length + 1})`,
          receptionEvaluations: base.receptionEvaluations ? [...base.receptionEvaluations] : undefined,
          serveTypes: base.serveTypes ? [...base.serveTypes] : undefined,
          serveStartZones: base.serveStartZones ? [...base.serveStartZones] : undefined,
          receptionZones: base.receptionZones ? [...base.receptionZones] : undefined,
          receiverKeys: base.receiverKeys ? [...base.receiverKeys] : undefined,
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
                      {RECEPTION_BANDS.map((band) => {
                        const isPresetActive = !view.receptionEvaluations?.length && view.receptionBand === band.value;
                        return (
                          <button
                            key={band.value}
                            type="button"
                            className={`setter-views-editor__chip${isPresetActive ? ' is-active' : ''}`}
                            aria-pressed={isPresetActive}
                            onClick={() => patchView(index, { receptionBand: band.value, receptionEvaluations: undefined })}
                          >
                            {t(band.labelKey)}
                          </button>
                        );
                      })}
                      {RECEPTION_EVALS.map((evalCode) => {
                        const active = getEffectiveReceptionEvals(view).includes(evalCode);
                        return (
                          <button
                            key={evalCode}
                            type="button"
                            className={`setter-views-editor__chip${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => toggleReceptionEval(index, evalCode)}
                          >
                            {evalCode}
                          </button>
                        );
                      })}
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
                      {SERVE_START_ZONES.map((zone) => {
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

                  <div className="setter-views-editor__group">
                    <span className="setter-views-editor__group-title">{t('setterViewReceptionZonesLabel')}</span>
                    <div className="setter-views-editor__chips">
                      <button
                        type="button"
                        className={`setter-views-editor__chip${!view.receptionZones?.length ? ' is-active' : ''}`}
                        aria-pressed={!view.receptionZones?.length}
                        onClick={() => patchView(index, { receptionZones: undefined })}
                      >
                        {t('setterViewFilterAll')}
                      </button>
                      {RECEPTION_ZONES.map((zone) => {
                        const active = Boolean(view.receptionZones?.includes(zone));
                        return (
                          <button
                            key={zone}
                            type="button"
                            className={`setter-views-editor__chip${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => toggleReceptionZone(index, zone)}
                          >
                            Z{zone}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {receivers.length > 0 ? (
                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-title">{t('setterViewReceiversLabel')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.receiverKeys?.length ? ' is-active' : ''}`}
                          aria-pressed={!view.receiverKeys?.length}
                          onClick={() => patchView(index, { receiverKeys: undefined })}
                        >
                          {t('setterViewFilterAll')}
                        </button>
                        {receivers.map((player) => {
                          const active = Boolean(view.receiverKeys?.includes(player.key));
                          const label = `#${player.jersey} ${player.name}`.trim();
                          return (
                            <button
                              key={player.key}
                              type="button"
                              className={`setter-views-editor__chip${active ? ' is-active' : ''}`}
                              aria-pressed={active}
                              onClick={() => toggleReceiverKey(index, player.key)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
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
