import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import {
  createEmptyTacticalSystem,
  type SystemKind,
  type TacticalSystemDefinition,
} from '@src/domain/systems';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';

function createSeedSystems(): TacticalSystemDefinition[] {
  return [
    {
      id: 'system-reception-base',
      name: 'Base Reception',
      kind: 'reception',
      responsibilities: [],
    },
    {
      id: 'system-defense-base',
      name: 'Base Defense',
      kind: 'defense',
      responsibilities: [],
    },
  ];
}

export function SystemsPage() {
  const { t } = useTranslation();
  const [systems, setSystems] = useState<TacticalSystemDefinition[]>(() => createSeedSystems());
  const [selectedSystemId, setSelectedSystemId] = useState<string>(() => createSeedSystems()[0].id);

  const selectedSystem = useMemo(
    () => systems.find((system) => system.id === selectedSystemId) ?? systems[0] ?? null,
    [selectedSystemId, systems],
  );

  const handleCreateSystem = (kind: SystemKind) => {
    const nextSystem: TacticalSystemDefinition = {
      ...createEmptyTacticalSystem(kind),
      name: kind === 'reception' ? t('newReceptionSystem') : t('newDefenseSystem'),
    };

    setSystems((current) => [...current, nextSystem]);
    setSelectedSystemId(nextSystem.id);
  };

  const handleUpdateSelectedSystem = (updates: Partial<TacticalSystemDefinition>) => {
    if (!selectedSystem) {
      return;
    }

    setSystems((current) =>
      current.map((system) =>
        system.id === selectedSystem.id
          ? {
              ...system,
              ...updates,
            }
          : system,
      ),
    );
  };

  return (
    <main className="app-page-screen systems-page">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card systems-page__card"
          headerClassName="app-page-card__header systems-page__header"
          contentClassName="app-page-card__content systems-page__content"
          header={(
            <div className="app-page-card__header-copy">
              <h1 className="app-page-card__title">{t('systems')}</h1>
              <p className="app-page-card__description">{t('systemsDescription')}</p>
            </div>
          )}
        >
        <section className="systems-page__layout">
          <aside className="systems-sidebar">
            <div className="systems-sidebar__header">
              <div>
                <h2 className="systems-sidebar__title">{t('systemLibrary')}</h2>
                <p className="systems-sidebar__meta">{systems.length} {t('systems')}</p>
              </div>
              <div className="systems-sidebar__actions">
                <button type="button" className="btn-secondary btn-small" onClick={() => handleCreateSystem('reception')}>
                  {t('newReceptionSystem')}
                </button>
                <button type="button" className="btn-secondary btn-small" onClick={() => handleCreateSystem('defense')}>
                  {t('newDefenseSystem')}
                </button>
              </div>
            </div>

            <div className="systems-sidebar__list">
              {systems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  className={`systems-sidebar__item${system.id === selectedSystem?.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedSystemId(system.id)}
                >
                  <span className="systems-sidebar__item-name">{system.name || t('untitledSystem')}</span>
                  <span className="systems-sidebar__item-kind">
                    {system.kind === 'reception' ? t('receptionSystem') : t('defenseSystem')}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="systems-editor">
            {selectedSystem ? (
              <>
                <div className="systems-editor__header">
                  <div>
                    <h2 className="systems-editor__title">{t('systemEditor')}</h2>
                    <p className="systems-editor__subtitle">{t('systemsEditorDescription')}</p>
                  </div>
                  <div className="systems-editor__badge">
                    {selectedSystem.kind === 'reception' ? t('receptionSystem') : t('defenseSystem')}
                  </div>
                </div>

                <div className="systems-editor__form">
                  <label className="systems-editor__field">
                    <span className="systems-editor__label">{t('systemName')}</span>
                    <input
                      className="systems-editor__input"
                      value={selectedSystem.name}
                      onChange={(event) => handleUpdateSelectedSystem({ name: event.target.value })}
                      placeholder={t('systemNamePlaceholder')}
                    />
                  </label>

                  <label className="systems-editor__field">
                    <span className="systems-editor__label">{t('systemKind')}</span>
                    <select
                      className="systems-editor__input"
                      value={selectedSystem.kind}
                      onChange={(event) => handleUpdateSelectedSystem({ kind: event.target.value as SystemKind })}
                    >
                      <option value="reception">{t('receptionSystem')}</option>
                      <option value="defense">{t('defenseSystem')}</option>
                    </select>
                  </label>
                </div>

                <section className="systems-editor__placeholder">
                  <h3 className="systems-editor__placeholder-title">{t('zoneResponsibilities')}</h3>
                  <p className="systems-editor__placeholder-copy">{t('zoneResponsibilitiesPlaceholder')}</p>
                  <div className="systems-editor__summary-grid">
                    <div className="systems-editor__summary-card">
                      <span className="systems-editor__summary-label">{t('systemTeamAssociation')}</span>
                      <strong className="systems-editor__summary-value">{selectedSystem.teamId ?? t('notSpecified')}</strong>
                    </div>
                    <div className="systems-editor__summary-card">
                      <span className="systems-editor__summary-label">{t('systemRotationAssociation')}</span>
                      <strong className="systems-editor__summary-value">
                        {selectedSystem.rotationIndex ?? t('allRotations')}
                      </strong>
                    </div>
                    <div className="systems-editor__summary-card">
                      <span className="systems-editor__summary-label">{t('responsibilityCount')}</span>
                      <strong className="systems-editor__summary-value">{selectedSystem.responsibilities.length}</strong>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </section>
        </section>
        </AppPageLayout>
      </div>
    </main>
  );
}
