import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { DefenseSystemEditor } from '../components/DefenseSystemEditor';
import { useDefenseSystemStore } from '../model';

export function SystemsPage() {
  const { t } = useTranslation();
  const defenseSystemBlocks = useDefenseSystemStore((state) => state.defenseSystemBlocks);
  const activeDefenseSystemBlock = useDefenseSystemStore((state) => state.activeDefenseSystemBlock);
  const activeDefenseSystemBlockId = useDefenseSystemStore((state) => state.activeDefenseSystemBlockId);
  const createDefenseSystemBlock = useDefenseSystemStore((state) => state.createDefenseSystemBlock);
  const saveDefenseSystemBlock = useDefenseSystemStore((state) => state.saveDefenseSystemBlock);
  const deleteDefenseSystemBlock = useDefenseSystemStore((state) => state.deleteDefenseSystemBlock);
  const setActiveDefenseSystemBlock = useDefenseSystemStore((state) => state.setActiveDefenseSystemBlock);

  const handleCreateDefenseSystem = () => {
    createDefenseSystemBlock({
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
                  <h2 className="systems-sidebar__title">{t('defenseSystems')}</h2>
                  <p className="systems-sidebar__meta">
                    {defenseSystemBlocks.length} {t('defenseSystem')}
                  </p>
                </div>
                <div className="systems-sidebar__actions">
                  <button type="button" className="btn-secondary btn-small" onClick={handleCreateDefenseSystem}>
                    {t('newDefenseSystem')}
                  </button>
                </div>
              </div>

              <div className="systems-sidebar__list">
                {defenseSystemBlocks.map((system) => (
                  <button
                    key={system.id}
                    type="button"
                    className={`systems-sidebar__item${system.id === activeDefenseSystemBlockId ? ' is-active' : ''}`}
                    onClick={() => setActiveDefenseSystemBlock(system.id)}
                  >
                    <span className="systems-sidebar__item-name">{system.name || t('untitledSystem')}</span>
                    <span className="systems-sidebar__item-kind">
                      {system.teamId ? `${t('team')}: ${system.teamId}` : t('defaultPlayingSystem')}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="systems-editor">
              {activeDefenseSystemBlock ? (
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
                    blocks={defenseSystemBlocks}
                    activeBlock={activeDefenseSystemBlock}
                    onSelectBlock={setActiveDefenseSystemBlock}
                    onSaveBlock={saveDefenseSystemBlock}
                    onDeleteBlock={deleteDefenseSystemBlock}
                  />
                </>
              ) : (
                <div className="systems-editor__placeholder">
                  <p>{t('defenseSystemEditorDescription')}</p>
                  <button type="button" className="btn-primary" onClick={handleCreateDefenseSystem}>
                    {t('newDefenseSystem')}
                  </button>
                </div>
              )}
            </section>
          </section>
        </AppPageLayout>
      </div>
    </main>
  );
}
