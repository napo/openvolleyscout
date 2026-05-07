import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { DefenseSystemEditor } from '../components/DefenseSystemEditor';
import { ReceptionSystemEditor } from '../components/ReceptionSystemEditor';
import { useDefenseSystemStore, useReceptionSystemStore } from '../model';

type SystemLibraryKind = 'defense' | 'reception';

export function SystemsPage() {
  const { t } = useTranslation();
  const [activeLibraryKind, setActiveLibraryKind] = useState<SystemLibraryKind>('defense');
  const defenseSystemBlocks = useDefenseSystemStore((state) => state.defenseSystemBlocks);
  const activeDefenseSystemBlock = useDefenseSystemStore((state) => state.activeDefenseSystemBlock);
  const activeDefenseSystemBlockId = useDefenseSystemStore((state) => state.activeDefenseSystemBlockId);
  const createDefenseSystemBlock = useDefenseSystemStore((state) => state.createDefenseSystemBlock);
  const saveDefenseSystemBlock = useDefenseSystemStore((state) => state.saveDefenseSystemBlock);
  const deleteDefenseSystemBlock = useDefenseSystemStore((state) => state.deleteDefenseSystemBlock);
  const setActiveDefenseSystemBlock = useDefenseSystemStore((state) => state.setActiveDefenseSystemBlock);
  const receptionSystemBlocks = useReceptionSystemStore((state) => state.receptionSystemBlocks);
  const activeReceptionSystemBlock = useReceptionSystemStore((state) => state.activeReceptionSystemBlock);
  const activeReceptionSystemBlockId = useReceptionSystemStore((state) => state.activeReceptionSystemBlockId);
  const createReceptionSystemBlock = useReceptionSystemStore((state) => state.createReceptionSystemBlock);
  const saveReceptionSystemBlock = useReceptionSystemStore((state) => state.saveReceptionSystemBlock);
  const deleteReceptionSystemBlock = useReceptionSystemStore((state) => state.deleteReceptionSystemBlock);
  const setActiveReceptionSystemBlock = useReceptionSystemStore((state) => state.setActiveReceptionSystemBlock);

  const isDefenseLibraryActive = activeLibraryKind === 'defense';
  const activeBlocks = isDefenseLibraryActive ? defenseSystemBlocks : receptionSystemBlocks;
  const activeBlockId = isDefenseLibraryActive ? activeDefenseSystemBlockId : activeReceptionSystemBlockId;
  const activeLibraryTitle = isDefenseLibraryActive ? t('defenseSystems') : t('receptionSystems');
  const activeLibraryItemLabel = isDefenseLibraryActive ? t('defenseSystem') : t('receptionSystem');
  const activeCreateLabel = isDefenseLibraryActive ? t('newDefenseSystem') : t('createDefaultReceptionSystem');

  const handleCreateDefenseSystem = () => {
    createDefenseSystemBlock({
      name: t('newDefenseSystem'),
    });
  };

  const handleCreateReceptionSystem = () => {
    createReceptionSystemBlock({
      name: t('newReceptionSystem'),
    });
  };

  const handleCreateActiveSystem = () => {
    if (isDefenseLibraryActive) {
      handleCreateDefenseSystem();
      return;
    }

    handleCreateReceptionSystem();
  };

  const handleSelectActiveBlock = (blockId: string) => {
    if (isDefenseLibraryActive) {
      setActiveDefenseSystemBlock(blockId);
      return;
    }

    setActiveReceptionSystemBlock(blockId);
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
              <div className="systems-kind-tabs" aria-label={t('systemKind')}>
                <button
                  type="button"
                  className={`systems-kind-tabs__button${isDefenseLibraryActive ? ' is-active' : ''}`}
                  onClick={() => setActiveLibraryKind('defense')}
                >
                  {t('defenseSystems')}
                </button>
                <button
                  type="button"
                  className={`systems-kind-tabs__button${activeLibraryKind === 'reception' ? ' is-active' : ''}`}
                  onClick={() => setActiveLibraryKind('reception')}
                >
                  {t('receptionSystems')}
                </button>
              </div>

              <div className="systems-sidebar__header">
                <div>
                  <h2 className="systems-sidebar__title">{activeLibraryTitle}</h2>
                  <p className="systems-sidebar__meta">
                    {activeBlocks.length} {activeLibraryItemLabel}
                  </p>
                </div>
                <div className="systems-sidebar__actions">
                  <button type="button" className="btn-secondary btn-small" onClick={handleCreateActiveSystem}>
                    {activeCreateLabel}
                  </button>
                </div>
              </div>

              <div className="systems-sidebar__list">
                {activeBlocks.map((system) => (
                  <button
                    key={system.id}
                    type="button"
                    className={`systems-sidebar__item${system.id === activeBlockId ? ' is-active' : ''}`}
                    onClick={() => handleSelectActiveBlock(system.id)}
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
              {isDefenseLibraryActive && activeDefenseSystemBlock ? (
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
              ) : null}

              {!isDefenseLibraryActive && activeReceptionSystemBlock ? (
                <>
                  <div className="systems-editor__header">
                    <div>
                      <h2 className="systems-editor__title">{t('receptionSystem')}</h2>
                      <p className="systems-editor__subtitle">{t('receptionSystemEditorDescription')}</p>
                    </div>
                    <div className="systems-editor__badge">
                      {t('receptionSystem')}
                    </div>
                  </div>

                  <ReceptionSystemEditor
                    blocks={receptionSystemBlocks}
                    activeBlock={activeReceptionSystemBlock}
                    onSelectBlock={setActiveReceptionSystemBlock}
                    onSaveBlock={saveReceptionSystemBlock}
                    onDeleteBlock={deleteReceptionSystemBlock}
                  />
                </>
              ) : null}

              {isDefenseLibraryActive && !activeDefenseSystemBlock ? (
                <div className="systems-editor__placeholder">
                  <p>{t('defenseSystemEditorDescription')}</p>
                  <button type="button" className="btn-primary" onClick={handleCreateDefenseSystem}>
                    {t('newDefenseSystem')}
                  </button>
                </div>
              ) : null}

              {!isDefenseLibraryActive && !activeReceptionSystemBlock ? (
                <div className="systems-editor__placeholder">
                  <p>{t('receptionSystemEditorDescription')}</p>
                  <button type="button" className="btn-primary" onClick={handleCreateReceptionSystem}>
                    {t('createDefaultReceptionSystem')}
                  </button>
                </div>
              ) : null}
            </section>
          </section>
        </AppPageLayout>
      </div>
    </main>
  );
}
