import { useRef, useState, type ChangeEvent } from 'react';
import {
  DEFENSE_SYSTEM_PRESET_OPTIONS,
  RECEPTION_SYSTEM_PRESET_OPTIONS,
} from '@src/config/systems';
import { useAllArchivedTeams } from '@src/features/startup/hooks/useTeamSuggestions';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { DefenseSystemEditor } from '../components/DefenseSystemEditor';
import { ReceptionSystemEditor } from '../components/ReceptionSystemEditor';
import { APP_VERSION } from '@src/lib/constants/app';
import { todayLocalDate } from '@src/lib/utils/local-date';
import { saveFile } from '@src/lib/utils/save-file';
import {
  getSystemLibraryFileName,
  parseSystemLibraryFile,
  serializeSystemLibraryFile,
  useDefenseSystemStore,
  useReceptionSystemStore,
  type SystemLibrarySnapshot,
} from '../model';

type SystemLibraryKind = 'defense' | 'reception';

const RECEPTION_PRESET_LABEL_KEYS: Record<string, TranslationKey> = {
  'psc-base': 'receptionPresetPscBase',
  'psc-p1-special': 'receptionPresetPscP1Special',
  'pcs-base': 'receptionPresetPcsBase',
};

const DEFENSE_PRESET_LABEL_KEYS: Record<string, TranslationKey> = {
  'psc-base': 'defensePresetPsc',
  'pcs-base': 'defensePresetPcs',
};

export function SystemsPage() {
  const { t } = useTranslation();
  const [activeLibraryKind, setActiveLibraryKind] = useState<SystemLibraryKind>('defense');
  const [receptionPresetId, setReceptionPresetId] = useState(RECEPTION_SYSTEM_PRESET_OPTIONS[0].id);
  const [defensePresetId, setDefensePresetId] = useState(DEFENSE_SYSTEM_PRESET_OPTIONS[0].id);
  const { teams } = useAllArchivedTeams();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [libraryMessage, setLibraryMessage] = useState<{ kind: 'status' | 'error'; text: string } | null>(null);
  const importReceptionSystemBlocks = useReceptionSystemStore((state) => state.importReceptionSystemBlocks);
  const importDefenseSystemBlocks = useDefenseSystemStore((state) => state.importDefenseSystemBlocks);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
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
  const activeCreateLabel = t('newFromPreset');

  const handleCreateDefenseSystem = () => {
    const preset = DEFENSE_SYSTEM_PRESET_OPTIONS.find((option) => option.id === defensePresetId);
    createDefenseSystemBlock({
      name: preset ? t(DEFENSE_PRESET_LABEL_KEYS[preset.id]) : t('newDefenseSystem'),
      preset,
    });
  };

  const handleCreateReceptionSystem = () => {
    const preset = RECEPTION_SYSTEM_PRESET_OPTIONS.find((option) => option.id === receptionPresetId);
    createReceptionSystemBlock({
      name: preset ? t(RECEPTION_PRESET_LABEL_KEYS[preset.id]) : t('newReceptionSystem'),
      preset,
    });
  };

  const handleCreateActiveSystem = () => {
    if (isDefenseLibraryActive) {
      handleCreateDefenseSystem();
      return;
    }

    handleCreateReceptionSystem();
  };

  // A copy starts unassigned, so it never takes a team away from the original.
  const handleDuplicateActiveSystem = () => {
    if (isDefenseLibraryActive && activeDefenseSystemBlock) {
      createDefenseSystemBlock({
        name: t('systemCopyName', { name: activeDefenseSystemBlock.name || t('untitledSystem') }),
        source: activeDefenseSystemBlock,
      });
      return;
    }

    if (!isDefenseLibraryActive && activeReceptionSystemBlock) {
      createReceptionSystemBlock({
        name: t('systemCopyName', { name: activeReceptionSystemBlock.name || t('untitledSystem') }),
        source: activeReceptionSystemBlock,
      });
    }
  };

  const exportSystems = async (snapshot: SystemLibrarySnapshot, systemName?: string) => {
    try {
      setLibraryMessage(null);
      await saveFile(
        getSystemLibraryFileName(todayLocalDate(), systemName),
        serializeSystemLibraryFile(snapshot, APP_VERSION),
        'application/json',
      );
    } catch (error) {
      console.error('Error exporting systems:', error);
      setLibraryMessage({ kind: 'error', text: t('systemsExportFailed') });
    }
  };

  const handleExportAllSystems = () => exportSystems({
    receptionSystems: receptionSystemBlocks,
    defenseSystems: defenseSystemBlocks,
  });

  const handleExportDefenseSystem = (block: DefenseSystemBlock) => exportSystems(
    { receptionSystems: [], defenseSystems: [block] },
    block.name,
  );

  const handleExportReceptionSystem = (block: ReceptionSystemBlock) => exportSystems(
    { receptionSystems: [block], defenseSystems: [] },
    block.name,
  );

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const library = parseSystemLibraryFile(await file.text());
      const renameConflict = (name: string) => t('systemImportedName', { name });
      const reception = importReceptionSystemBlocks(library.receptionSystems, renameConflict);
      const defense = importDefenseSystemBlocks(library.defenseSystems, renameConflict);
      if (library.receptionSystems.length > 0 && library.defenseSystems.length === 0) {
        setActiveLibraryKind('reception');
      } else if (library.defenseSystems.length > 0 && library.receptionSystems.length === 0) {
        setActiveLibraryKind('defense');
      }
      setLibraryMessage({
        kind: 'status',
        text: t('systemsImported', {
          addedCount: reception.added + defense.added,
          unchangedCount: reception.unchanged + defense.unchanged,
        }),
      });
    } catch (error) {
      console.error('Error importing systems:', error);
      setLibraryMessage({ kind: 'error', text: t('systemsImportFailed') });
    }
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
                  <select
                    className="systems-editor__input"
                    aria-label={t('systemPreset')}
                    value={isDefenseLibraryActive ? defensePresetId : receptionPresetId}
                    onChange={(event) => (isDefenseLibraryActive
                      ? setDefensePresetId(event.target.value)
                      : setReceptionPresetId(event.target.value))}
                  >
                    {(isDefenseLibraryActive ? DEFENSE_SYSTEM_PRESET_OPTIONS : RECEPTION_SYSTEM_PRESET_OPTIONS).map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {t((isDefenseLibraryActive ? DEFENSE_PRESET_LABEL_KEYS : RECEPTION_PRESET_LABEL_KEYS)[preset.id])}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary btn-small" onClick={handleCreateActiveSystem}>
                    {activeCreateLabel}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={handleDuplicateActiveSystem}
                    disabled={isDefenseLibraryActive ? !activeDefenseSystemBlock : !activeReceptionSystemBlock}
                  >
                    {t('duplicateSystem')}
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
                      {system.teamId
                        ? `${t('team')}: ${teamNameById.get(system.teamId) ?? t('systemTeamMissing')}`
                        : t('systemTeamNone')}
                    </span>
                  </button>
                ))}
              </div>

              <div className="systems-sidebar__library">
                <h3 className="systems-sidebar__library-title">{t('systemsFile')}</h3>
                <div className="systems-sidebar__actions">
                  <button type="button" className="btn-secondary btn-small" onClick={handleExportAllSystems}>
                    {t('exportAllSystems')}
                  </button>
                  <button type="button" className="btn-secondary btn-small" onClick={() => importInputRef.current?.click()}>
                    {t('importSystems')}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={handleImportFile}
                  />
                </div>
                {libraryMessage ? (
                  <p
                    className={`systems-sidebar__library-message${libraryMessage.kind === 'error' ? ' is-error' : ''}`}
                    role={libraryMessage.kind === 'error' ? 'alert' : 'status'}
                  >
                    {libraryMessage.text}
                  </p>
                ) : null}
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
                    teams={teams}
                    onSelectBlock={setActiveDefenseSystemBlock}
                    onSaveBlock={saveDefenseSystemBlock}
                    onDeleteBlock={deleteDefenseSystemBlock}
                    onExportBlock={handleExportDefenseSystem}
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
                    teams={teams}
                    onSelectBlock={setActiveReceptionSystemBlock}
                    onSaveBlock={saveReceptionSystemBlock}
                    onDeleteBlock={deleteReceptionSystemBlock}
                    onExportBlock={handleExportReceptionSystem}
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
