// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Bulk multi-file import engine: clean files are imported automatically without
 * confirmation, while files with duplicates, player reconciliations, OVS
 * conflicts, multi-game TieBreak DBs, or parse/validation errors are collected
 * into a table for batch decision and import.
 */
import { getMatchTeamSnapshot, setMatchTeamSelection } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedTeam } from '@src/domain/team/types';
import { areTeamNamesSimilar } from '@src/features/teams/model/team-merge';
import {
  listTiebreakGames,
  mapDataVolleyMatchToOvsProject,
  parseDataVolleyFile,
  parseTiebreakDatabase,
  persistDataVolleyImportedTeams,
  previewDataVolleyTeamPersistence,
  validateImportedMatch,
  validateImportedStats,
  type DataVolleyPlayerDecisions,
  type DataVolleyTeamPersistencePreview,
  type DataVolleyTeamPersistenceRepository,
  type MappedDataVolleyImport,
  type ParsedDataVolleyMatch,
  type ParsedImportWarning,
} from '@src/features/import';
import { playerReconciliationsComplete } from '@src/features/import/preview/PlayerReconciliation';
import { buildOvsImportPreview, type OvsImportPreview } from '@src/features/sync/import/build-ovs-import-preview';
import { confirmOvsImport } from '@src/features/sync/import/confirm-ovs-import';
import { peekOvsManifest } from '@src/features/sync/ovs-bundle';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';

export type DataVolleyDateOrder = 'auto' | 'day-first' | 'month-first';

export type BulkImportFormat = 'dvw' | 'ovs' | 'tiebreak';

export type BulkImportIssueKind =
  | 'duplicate_match'
  | 'similar_team'
  | 'player_reconciliation'
  | 'ovs_conflict'
  | 'tiebreak_multi_game'
  | 'validation_error'
  | 'parse_error';

export type BulkImportDecision =
  | 'overwrite'
  | 'copy'
  | 'link_similar_team'
  | 'create_new_team'
  | 'merge_players'
  | 'create_players'
  | 'use_remote'
  | 'keep_local'
  | 'skip';

export interface BulkImportProblemRow {
  id: string;
  file: File;
  fileName: string;
  format: BulkImportFormat;
  matchLabel: string;
  issueKind: BulkImportIssueKind;
  issueSummary: string;
  issueDiagnostic?: ParsedImportWarning;
  decision: BulkImportDecision;
  availableDecisions: BulkImportDecision[];
  parsedDvw?: ParsedDataVolleyMatch;
  mappedDvw?: MappedDataVolleyImport;
  duplicates?: MatchProject[];
  similarTeams?: Array<{ side: 'home' | 'away'; importedName: string; existingTeam: ArchivedTeam }>;
  teamPersistencePreview?: DataVolleyTeamPersistencePreview[];
  ovsPreview?: OvsImportPreview;
}

export interface BulkImportPassResult {
  total: number;
  autoImportedCount: number;
  autoImportedWithWarnings: number;
  problems: BulkImportProblemRow[];
}

export interface BulkImportProgress {
  processed: number;
  total: number;
  currentFileName: string;
  autoImportedCount: number;
  problemsCount: number;
}

export interface BulkImportDeps {
  matchRepo: Pick<typeof matchRepository, 'list' | 'create' | 'delete'>;
  teamRepo: DataVolleyTeamPersistenceRepository;
  dateOrder?: DataVolleyDateOrder;
  onProgress?: (progress: BulkImportProgress) => void;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findDuplicateMatches(incoming: MatchProject, existing: MatchProject[]): MatchProject[] {
  const inHome = normalizeTeamName(getMatchTeamSnapshot(incoming, 'home').name);
  const inAway = normalizeTeamName(getMatchTeamSnapshot(incoming, 'away').name);
  const inPlayedAt = (incoming.metadata.playedAt ?? '').slice(0, 16);

  return existing.filter((project) => {
    const exHome = normalizeTeamName(getMatchTeamSnapshot(project, 'home').name);
    const exAway = normalizeTeamName(getMatchTeamSnapshot(project, 'away').name);
    if (inHome !== exHome || inAway !== exAway) return false;
    const exPlayedAt = (project.metadata.playedAt ?? '').slice(0, 16);
    if (!inPlayedAt && !exPlayedAt) return true;
    if (!inPlayedAt || !exPlayedAt) return false;
    return inPlayedAt === exPlayedAt;
  });
}

function formatDvwMatchLabel(project: MatchProject, fallback: string): string {
  const home = getMatchTeamSnapshot(project, 'home').name.trim();
  const away = getMatchTeamSnapshot(project, 'away').name.trim();
  const date = project.metadata.playedAt ?? '';
  const teams = home && away ? `${home} - ${away}` : fallback;
  return date ? `${teams} (${date})` : teams;
}

function buildAutoMergeDecisions(previews: readonly DataVolleyTeamPersistencePreview[], action: 'merge' | 'distinct'): DataVolleyPlayerDecisions {
  const decisions: DataVolleyPlayerDecisions = {};
  for (const teamPreview of previews) {
    for (const item of teamPreview.playerReconciliations ?? []) {
      const candidate = item.candidates[0];
      if (action === 'merge' && candidate) {
        decisions[item.key] = { action: 'merge', playerId: candidate.id };
      } else {
        decisions[item.key] = { action: 'distinct' };
      }
    }
  }
  return decisions;
}

export async function runBulkImportPass(
  files: readonly File[],
  deps: BulkImportDeps = { matchRepo: matchRepository, teamRepo: teamRepository },
): Promise<BulkImportPassResult> {
  const existingMatches = [...(await deps.matchRepo.list())];
  let autoImportedCount = 0;
  let autoImportedWithWarnings = 0;
  const problems: BulkImportProblemRow[] = [];

  const handleDvwOrTiebreak = async (
    file: File,
    format: 'dvw' | 'tiebreak',
    parsed: ParsedDataVolleyMatch,
    rowId: string,
  ) => {
    const mapped = mapDataVolleyMatchToOvsProject(parsed, { sourceName: file.name });
    const matchLabel = formatDvwMatchLabel(mapped.project, file.name);
    const initialErrors = [
      ...parsed.warnings,
      ...mapped.warnings,
      ...validateImportedMatch(mapped.project),
      ...validateImportedStats(mapped.project),
    ].filter((d) => d.severity === 'error');

    if (initialErrors.length > 0) {
      problems.push({
        id: rowId,
        file,
        fileName: file.name,
        format,
        matchLabel,
        issueKind: 'validation_error',
        issueSummary: initialErrors[0].message,
        issueDiagnostic: initialErrors[0],
        decision: 'skip',
        availableDecisions: ['skip'],
        parsedDvw: parsed,
        mappedDvw: mapped,
      });
      return;
    }

    const teamPreview = await previewDataVolleyTeamPersistence(mapped.project, deps.teamRepo);
    const duplicates = findDuplicateMatches(mapped.project, existingMatches);
    const reconciliationsReady = playerReconciliationsComplete(teamPreview.teamPreviews, {});

    if (duplicates.length > 0) {
      const existingLabel = formatDvwMatchLabel(duplicates[0], file.name);
      problems.push({
        id: rowId,
        file,
        fileName: file.name,
        format,
        matchLabel,
        issueKind: 'duplicate_match',
        issueSummary: duplicates.length > 1
          ? `${duplicates.length}x: ${existingLabel}`
          : existingLabel,
        decision: 'skip',
        availableDecisions: ['overwrite', 'copy', 'skip'],
        parsedDvw: parsed,
        mappedDvw: mapped,
        duplicates,
        teamPersistencePreview: teamPreview.teamPreviews,
      });
      return;
    }

    if (!reconciliationsReady) {
      const allReconciliations = teamPreview.teamPreviews.flatMap((tp) => tp.playerReconciliations ?? []);
      const previewNames = allReconciliations
        .slice(0, 3)
        .map((item) => `#${item.imported.jerseyNumber} ${item.imported.lastName || item.imported.firstName}`.trim());
      const extraCount = allReconciliations.length - previewNames.length;
      const summaryNames = extraCount > 0 ? `${previewNames.join(', ')} (+${extraCount})` : previewNames.join(', ');
      problems.push({
        id: rowId,
        file,
        fileName: file.name,
        format,
        matchLabel,
        issueKind: 'player_reconciliation',
        issueSummary: summaryNames || `${allReconciliations.length}`,
        decision: 'merge_players',
        availableDecisions: ['merge_players', 'create_players', 'skip'],
        parsedDvw: parsed,
        mappedDvw: mapped,
        teamPersistencePreview: teamPreview.teamPreviews,
      });
      return;
    }

    const creatingPreviews = teamPreview.teamPreviews.filter((tp) => tp.action === 'create');
    if (creatingPreviews.length > 0) {
      const archivedTeams = await deps.teamRepo.list();
      const similarTeams: Array<{ side: 'home' | 'away'; importedName: string; existingTeam: ArchivedTeam }> = [];
      for (const tp of creatingPreviews) {
        const probe: ArchivedTeam = {
          id: '__probe__',
          teamCode: '',
          name: tp.teamName,
          staff: { headCoach: '', assistantCoach: '' },
          rosterIds: [],
          createdAt: 0,
          updatedAt: 0,
        };
        const matchTeam = archivedTeams.find((existing) => areTeamNamesSimilar(probe, existing));
        if (matchTeam) {
          similarTeams.push({ side: tp.side, importedName: tp.teamName, existingTeam: matchTeam });
        }
      }
      if (similarTeams.length > 0) {
        problems.push({
          id: rowId,
          file,
          fileName: file.name,
          format,
          matchLabel,
          issueKind: 'similar_team',
          issueSummary: similarTeams.map((s) => `${s.importedName} -> ${s.existingTeam.name}`).join('; '),
          decision: 'link_similar_team',
          availableDecisions: ['link_similar_team', 'create_new_team', 'skip'],
          parsedDvw: parsed,
          mappedDvw: mapped,
          similarTeams,
          teamPersistencePreview: teamPreview.teamPreviews,
        });
        return;
      }
    }

    const persistence = await persistDataVolleyImportedTeams(mapped.project, deps.teamRepo, {});
    const postErrors = [
      ...mapped.warnings,
      ...persistence.warnings,
      ...validateImportedMatch(persistence.project),
      ...validateImportedStats(persistence.project),
    ].filter((d) => d.severity === 'error');

    if (postErrors.length > 0) {
      problems.push({
        id: rowId,
        file,
        fileName: file.name,
        format,
        matchLabel,
        issueKind: 'validation_error',
        issueSummary: postErrors[0].message,
        issueDiagnostic: postErrors[0],
        decision: 'skip',
        availableDecisions: ['skip'],
        parsedDvw: parsed,
        mappedDvw: mapped,
      });
      return;
    }

    const created = await deps.matchRepo.create(persistence.project);
    existingMatches.push(created);
    autoImportedCount += 1;
    const hasWarnings = [...parsed.warnings, ...mapped.warnings, ...persistence.warnings]
      .some((d) => d.severity === 'warning');
    if (hasWarnings) autoImportedWithWarnings += 1;
  };

  if (deps.onProgress) {
    deps.onProgress({
      processed: 0,
      total: files.length,
      currentFileName: files[0]?.name ?? '',
      autoImportedCount: 0,
      problemsCount: 0,
    });
    await yieldToMainThread();
  }
  let lastYieldAt = Date.now();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (deps.onProgress) {
      deps.onProgress({
        processed: index,
        total: files.length,
        currentFileName: file.name,
        autoImportedCount,
        problemsCount: problems.length,
      });
      if (Date.now() - lastYieldAt >= 16) {
        await yieldToMainThread();
        lastYieldAt = Date.now();
      }
    }
    const rowId = `bulk-${index}-${file.name}`;
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.ovs')) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const manifest = peekOvsManifest(bytes);
        if (manifest.kind === 'backup') {
          problems.push({
            id: rowId,
            file,
            fileName: file.name,
            format: 'ovs',
            matchLabel: file.name,
            issueKind: 'ovs_conflict',
            issueSummary: 'Backup archive (requires interactive preview)',
            decision: 'skip',
            availableDecisions: ['skip'],
          });
          continue;
        }
        const preview = await buildOvsImportPreview(bytes);
        if (preview.kind === 'new_match') {
          const saved = await confirmOvsImport(preview);
          existingMatches.push(saved);
          autoImportedCount += 1;
          continue;
        }
        const matchLabel = preview.kind === 'no_common_base'
          ? formatDvwMatchLabel(preview.remote, file.name)
          : formatDvwMatchLabel(preview.local, file.name);
        problems.push({
          id: rowId,
          file,
          fileName: file.name,
          format: 'ovs',
          matchLabel,
          issueKind: 'ovs_conflict',
          issueSummary: preview.kind === 'no_common_base' ? 'No common base' : 'Merge conflict',
          decision: preview.kind === 'no_common_base' ? 'use_remote' : 'skip',
          availableDecisions: preview.kind === 'no_common_base' ? ['use_remote', 'keep_local', 'skip'] : ['skip'],
          ovsPreview: preview,
        });
      } catch (error) {
        problems.push({
          id: rowId,
          file,
          fileName: file.name,
          format: 'ovs',
          matchLabel: file.name,
          issueKind: 'parse_error',
          issueSummary: error instanceof Error ? error.message : 'OVS parse failed',
          decision: 'skip',
          availableDecisions: ['skip'],
        });
      }
      continue;
    }

    if (/\.(db|sqlite)$/i.test(lower)) {
      try {
        const buffer = await file.arrayBuffer();
        const games = await listTiebreakGames(buffer);
        if (games.length === 0) {
          problems.push({
            id: rowId,
            file,
            fileName: file.name,
            format: 'tiebreak',
            matchLabel: file.name,
            issueKind: 'parse_error',
            issueSummary: 'No games found in Tiebreak database',
            decision: 'skip',
            availableDecisions: ['skip'],
          });
          continue;
        }
        if (games.length > 1) {
          problems.push({
            id: rowId,
            file,
            fileName: file.name,
            format: 'tiebreak',
            matchLabel: file.name,
            issueKind: 'tiebreak_multi_game',
            issueSummary: `${games.length} matches in database`,
            decision: 'skip',
            availableDecisions: ['skip'],
          });
          continue;
        }
        const parsed = await parseTiebreakDatabase(buffer, { sourceName: file.name, gameId: games[0].id });
        await handleDvwOrTiebreak(file, 'tiebreak', parsed, rowId);
      } catch (error) {
        problems.push({
          id: rowId,
          file,
          fileName: file.name,
          format: 'tiebreak',
          matchLabel: file.name,
          issueKind: 'parse_error',
          issueSummary: error instanceof Error ? error.message : 'Tiebreak parse failed',
          decision: 'skip',
          availableDecisions: ['skip'],
        });
      }
      continue;
    }

    try {
      const parsed = parseDataVolleyFile(await file.arrayBuffer(), {
        sourceName: file.name,
        dateOrder: deps.dateOrder,
      });
      await handleDvwOrTiebreak(file, 'dvw', parsed, rowId);
    } catch (error) {
      problems.push({
        id: rowId,
        file,
        fileName: file.name,
        format: 'dvw',
        matchLabel: file.name,
        issueKind: 'parse_error',
        issueSummary: error instanceof Error ? error.message : 'DVW parse failed',
        decision: 'skip',
        availableDecisions: ['skip'],
      });
    }
  }

  deps.onProgress?.({
    processed: files.length,
    total: files.length,
    currentFileName: '',
    autoImportedCount,
    problemsCount: problems.length,
  });

  return {
    total: files.length,
    autoImportedCount,
    autoImportedWithWarnings,
    problems,
  };
}

export async function resolveBulkProblemRow(
  row: BulkImportProblemRow,
  decision: BulkImportDecision,
  deps: BulkImportDeps = { matchRepo: matchRepository, teamRepo: teamRepository },
): Promise<{ imported: boolean; error?: string }> {
  if (decision === 'skip') return { imported: false };

  if (row.format === 'ovs' && row.ovsPreview) {
    if (row.ovsPreview.kind === 'no_common_base' && (decision === 'use_remote' || decision === 'keep_local')) {
      await confirmOvsImport(row.ovsPreview, { noCommonBaseChoice: decision });
      return { imported: true };
    }
    return { imported: false };
  }

  if (!row.mappedDvw || !row.parsedDvw) {
    return { imported: false, error: row.issueSummary };
  }

  const playerDecisions: DataVolleyPlayerDecisions = row.teamPersistencePreview
    ? buildAutoMergeDecisions(row.teamPersistencePreview, decision === 'create_players' ? 'distinct' : 'merge')
    : {};

  let projectToPersist = row.mappedDvw.project;
  if (decision === 'link_similar_team' && row.similarTeams?.length) {
    projectToPersist = structuredClone(row.mappedDvw.project);
    for (const item of row.similarTeams) {
      const sel = item.side === 'home' ? projectToPersist.homeSelection : projectToPersist.awaySelection;
      if (!sel) continue;
      setMatchTeamSelection(projectToPersist, item.side, {
        ...sel,
        teamId: item.existingTeam.id,
        archivedTeamId: item.existingTeam.id,
        teamCode: item.existingTeam.teamCode,
        teamName: item.existingTeam.name,
      });
    }
  }

  const teamPersistence = await persistDataVolleyImportedTeams(
    projectToPersist,
    deps.teamRepo,
    playerDecisions,
  );
  const errors = [
    ...row.mappedDvw.warnings,
    ...teamPersistence.warnings,
    ...validateImportedMatch(teamPersistence.project),
    ...validateImportedStats(teamPersistence.project),
  ].filter((d) => d.severity === 'error');

  if (errors.length > 0) {
    return { imported: false, error: errors[0].message };
  }

  if (decision === 'overwrite' && row.duplicates) {
    for (const dup of row.duplicates) {
      await deps.matchRepo.delete(dup.metadata.id);
    }
  }

  await deps.matchRepo.create(teamPersistence.project);
  return { imported: true };
}

export type BulkTableSortKey = 'fileName' | 'format' | 'matchLabel' | 'issueKind' | 'issueSummary' | 'decision';

export function filterAndSortBulkProblems(
  rows: readonly BulkImportProblemRow[],
  query: string,
  sortKey: BulkTableSortKey,
  sortDir: 'asc' | 'desc',
  getIssueLabel: (kind: BulkImportIssueKind) => string,
  getDecisionLabel: (decision: BulkImportDecision) => string,
): BulkImportProblemRow[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => {
      const hay = [
        row.fileName,
        row.format,
        row.matchLabel,
        getIssueLabel(row.issueKind),
        row.issueSummary,
        getDecisionLabel(row.decision),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    })
    : [...rows];

  const dir = sortDir === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const val = (r: BulkImportProblemRow): string => {
      switch (sortKey) {
        case 'fileName': return r.fileName;
        case 'format': return r.format;
        case 'matchLabel': return r.matchLabel;
        case 'issueKind': return getIssueLabel(r.issueKind);
        case 'issueSummary': return r.issueSummary;
        case 'decision': return getDecisionLabel(r.decision);
      }
    };
    return val(a).localeCompare(val(b)) * dir;
  });
}
