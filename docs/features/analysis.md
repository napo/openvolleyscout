# Analysis Feature

## Purpose

The Analysis feature is the post-match and review workspace. It turns a saved
`MatchProject` event log into reports, dashboards, DataVolley export, video
review, and multi-match team analysis.

There is no separate analysis database. Most analysis output is derived on
demand from `MatchProject.events`, `MatchProject.scoutingSession`, team
snapshots, and optional `MatchProject.videoAnalysis` metadata.

## Entry Points

- `src/features/analysis/pages/AnalysisPage.tsx` - analysis for the active
  match project.
- `src/features/teams/pages/TeamAnalysisPage.tsx` - multi-match analysis for
  a selected archived team.

Routes:

- `#/analysis`
- `#/team-analysis`

`#/team-analysis` is normally reached from the Teams workflow with navigation
state that identifies the team by archived team id or name.

## Single-Match Analysis

`AnalysisPage` loads the active project from `useAppStore`, rebuilds completed
sets from persisted session data and events, then calls `buildMatchStats()`.

Current tabs:

- Match report - `MatchReportTable` plus print, PNG, and PDF export helpers.
- Team performance - `TeamPerformanceDashboard`.
- Player performance - `PlayerPerformanceDashboard`, including heatmaps.
- Side-out study - `SideOutStudyPanel`.
- Video analysis - `VideoAnalysisPanel`.

The DataVolley export action also lives in this page and calls
`exportMatchToDataVolley()` followed by browser download.

## Multi-Match Team Analysis

`TeamAnalysisPage` lists all saved match projects involving the selected team.
The user chooses which matches to include, then the page builds per-match
`MatchStats` and passes them to `buildAggregatedTeamMatchStats()`.

Aggregation rules:

- the selected focus team is normalized to the `home` side in the aggregated
  result
- all opponents are normalized to the `away` side and combined under one label
- player stats for the focus team are merged by player id
- opponent players are kept as away-side entries
- rallies are side-normalized so existing filters and widgets can be reused
- synthetic set buckets group set 1 from all selected matches together, set 2
  together, and so on

The team analysis tabs reuse the same dashboard components as single-match
analysis with `lockedTeam="home"` where needed:

- team performance
- player performance
- side-out study
- multi-video analysis

## Video Analysis

Video review is implemented in `src/features/analysis/video/`.

Important modules:

- `VideoAnalysisPanel.tsx` - single-match video review.
- `MultiVideoAnalysisPanel.tsx` - focus-team review across selected matches.
- `video-event-index.ts` - builds playable action entries from match events.
- `video-filters.ts` - skill, team, set, player, evaluation, phase, setter
  position, and rally-outcome filters.
- `video-sync.ts` - maps event clock time to video time through sync points.
- `clip-export.ts` - builds clip intervals from filtered entries.
- `media-recorder-exporter.ts` - browser MediaRecorder clip export.
- `ffmpeg-sidecar-exporter.ts` - Tauri sidecar export for local files.
- `file-handle-store.ts` - stores browser File System Access handles in a
  separate IndexedDB database.
- `apply-code-edit.ts` - applies edited DataVolley-like codes back to touches.

OVS never stores video bytes in the match project. It stores only:

- a local file reference or YouTube URL
- synchronization anchors between touches and video time
- clip padding before and after each action

For local browser files, Chromium-based browsers can store a
`FileSystemFileHandle` in the `ovs-video-file-handles` IndexedDB database so
the user can relink the same file with a permission prompt.

## Video Workflows

Single-match video analysis supports:

- local video file selection
- manual local path entry for desktop/Tauri use
- YouTube URL loading
- synchronization on the first serve or any listed action
- filtered action playback
- auto-advance through filtered actions
- clip padding controls
- clip export for local files where supported
- inline action-code editing through the expert code parser

Multi-match video analysis supports:

- switching between selected match videos
- focus-team-only event lists
- filtering by opponent match, set, skill, player, evaluation, phase, setter
  position, and outcome
- per-project synchronization points
- sequence playback across filtered focus-team actions
- clip export only when one specific opponent match is selected
- YouTube playlist export for synchronized YouTube sources

## Derived Data Boundaries

The analysis layer should reuse existing derived models instead of creating a
parallel statistics system:

- `buildMatchStats()` remains the source for per-match stats.
- `buildAggregatedTeamMatchStats()` adapts multiple matches into a `MatchStats`
  shape consumed by existing dashboards.
- Video event indexes are derived from `MatchProject.events` and do not own
  match state.
- Reports are generated on demand; exported PNG/PDF files are not persisted.

## Current Constraints

- Video files are external resources. If a local file moves, the user must
  relink it.
- YouTube sources support playback and playlist export, but not direct clip
  download.
- Multi-match clip export requires a specific opponent match, not the aggregate
  "all opponents" view.
- Aggregated set stats are buckets by set number, not real continuous match
  sets.
- The analysis route depends on an active project; saved matches are opened
  from Load Data before viewing single-match analysis.
