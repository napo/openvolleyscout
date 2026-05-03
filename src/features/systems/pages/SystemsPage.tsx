import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { DefenseSystemEditor } from '../components/DefenseSystemEditor';
import { useDefenseSystemStore } from '../model';

export function SystemsPage() {
  const { t } = useTranslation();
  const defenseSystems = useDefenseSystemStore((state) => state.defenseSystems);
  const activeDefenseSystem = useDefenseSystemStore((state) => state.activeDefenseSystem);
  const activeDefenseSystemId = useDefenseSystemStore((state) => state.activeDefenseSystemId);
  const createDefenseSystem = useDefenseSystemStore((state) => state.createDefenseSystem);
  const saveDefenseSystem = useDefenseSystemStore((state) => state.saveDefenseSystem);
  const setActiveDefenseSystem = useDefenseSystemStore((state) => state.setActiveDefenseSystem);

  const handleCreateDefenseSystem = () => {
    createDefenseSystem({
      name: t('newDefenseSystem'),
    });
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
                  <p className="systems-sidebar__meta">
                    {defenseSystems.length} {t('defenseSystem')}
                  </p>
                </div>
                <div className="systems-sidebar__actions">
                  <button type="button" className="btn-secondary btn-small" onClick={handleCreateDefenseSystem}>
                    {t('newDefenseSystem')}
                  </button>
                </div>
              </div>

              <div className="systems-sidebar__list">
                {defenseSystems.map((system) => (
                  <button
                    key={system.id}
                    type="button"
                    className={`systems-sidebar__item${system.id === activeDefenseSystemId ? ' is-active' : ''}`}
                    onClick={() => setActiveDefenseSystem(system.id)}
                  >
                    <span className="systems-sidebar__item-name">{system.name || t('untitledSystem')}</span>
                    <span className="systems-sidebar__item-kind">
                      {system.teamId ? `${t('team')}: ${system.teamId}` : t('defenseSystem')}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="systems-editor">
              {activeDefenseSystem ? (
                <>
                  <div className="systems-editor__header">
                    <div>
                      <h2 className="systems-editor__title">{t('defenseSystem')}</h2>
                      <p className="systems-editor__subtitle">{t('defenseSystemEditorDescription')}</p>
                    </div>
                    <div className="systems-editor__badge">
                      {t('defenseSystem')}
                    </div>
                  </div>

                  <DefenseSystemEditor
                    systems={defenseSystems}
                    activeSystem={activeDefenseSystem}
                    onSelectSystem={setActiveDefenseSystem}
                    onSaveSystem={saveDefenseSystem}
                  />
                </>
              ) : null}
            </section>
          </section>
        </AppPageLayout>
      </div>
    </main>
  );
}
