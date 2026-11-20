# Changelog

## 0.37.0 - 2026-11-20

### Added
- Serve start zones now follow the DataVolley manual (13.2): five per team instead of three (`domain/spatial`). Zone 9 (between 6 and 1) and zone 7 (between 6 and 5) join 1, 6 and 5, so a serve from the conflict zones is recorded and exported with its real code. The three original lane ids are kept, so saved matches still resolve; the new cells are `mid-left` and `mid-right`. The setter-view filter lists all five and the serve report court spreads the five start rows.
- Import (`datavolley-zone-to-stage.ts`): serves from 9 and 7 start on the baseline between their neighbours instead of at the deep in-court zones. Import validation checks that serves from zones 9 and 7 keep their direction (the demo has 11 serves from 9).
- Tags input (`TagZonePicker.tsx`): the serve start is one row along the baseline with the five zones (5, 7, 6, 9, 1), and a reception takes the serve origin from the same five on the opponent's baseline (1, 9, 6, 7, 5), instead of picking from the nine-zone court with most zones disabled.
- Video analysis (`video-filters.ts`, `video-event-index.ts`, both video panels): new **Serve start zone** filter (1, 9, 6, 7, 5). Every touch of a rally carries the zone its serve started from (read from the serve, or from the reception for files that only write it there), so the filter keeps whole rallies; combined with the skill filter it lists only the serves from a zone. Three more filters read the same rally context as the side-out study: **serve type** (jump spin, jump float, float, other), **direction** (the zone the serve went to or was received in) and **receiver**. Saved filter presets from before these fields existed keep working.
- Side-out study (`sideout-distribution.ts`, `SideOutStudyPanel.tsx`): four new filters on the serve that opened the possession: **serve start zone** (1, 9, 6, 7, 5), **serve type** (jump spin, jump float, float, other), **direction** (the zone the serve was received in or went to) and **receiver**. Like the existing ones they keep everything by default.
- Serve readers (`analytics/serve-attributes.ts`): start zone, serve type and target zone are read in one shared module used by the side-out study and the tactical report setter views, so both filter the same way.

### Changed
- Heatmaps (`serve-start-badges.ts`, `ZoneDensityMode.tsx`): serve count badges and serve arrow origins give 7 and 9 their own row between 5/6 and 6/1, instead of merging them into the badges of 5 and 1.
- Tactical report setter views (`SetterViewsEditor.tsx`): the serve start filter lists the five DataVolley zones (1, 9, 6, 7, 5) instead of three.

### Fixed
- Setter after a double change (`setter-after-substitution.ts`, `personnel.ts`, `replay.ts`, `scouting-store.ts`, `ScoutingPage.tsx`): a substitution never updated who the setter is, so after "setter out for the opposite, opposite out for the other setter" the lineup kept the old setter (or the opposite who held the setter's slot), the court formation and the "P1" header followed the wrong player and the libero landed in the wrong row. The setter now follows each substitution using the roster roles (the incoming setter takes over from a stand-in; a recorded setter no longer on court is replaced by the roster setter on court), and matches are replayed from their events, so existing matches are corrected when reopened. Rosters without roles cannot tell, so when the setter is a stand-in who came in during the same break the next substitution asks "who is the new setter?", suggesting the incoming player instead of whoever is in the first slot.

## 0.36.1 - 2026-11-19

### Added
- DOM test environment (`jsdom`, `@testing-library/react`, `@testing-library/user-event`, all MIT): component tests opt in per file with `// @vitest-environment jsdom` (`*.dom.test.tsx`), first covering the confirmation dialog and the multi-athlete selector.
- Tactical report setter distribution views (`SetterViewsEditor.tsx`, `attacking-metrics.ts`, `types.ts`): added individual multi-select reception evaluation chips (`#`, `+`, `!`, `-`) alongside the quick band presets so coaches can build dedicated sheets for single evaluations or custom combinations.

### Changed
- Confirmation dialog (`confirm-dialog.tsx`): focus now starts on Cancel (the safe choice), Tab and Shift+Tab stay inside the dialog, and focus returns to the element that opened it.
- CI (`deploy.yml`, `release-native.yml`): `npm test` runs before the web deploy and before any release is created, so a failing test blocks publication (the Android workflow already did).
- Match report (`MatchReportTable.tsx`, `match-report-pdf.ts`): redesigned "Points by rotation" with a compact `A` / `B` team legend and 6 side-by-side rows (`P1`..`P6`) so long team names stay clean and legible on web and PDF.
- Tactical report setter views (`SetterViewsEditor.tsx`): aligned serve start zones to DataVolley (`Z1`, `Z6`, `Z5` only) and reception arrival zones to all 9 DataVolley zones (`Z1`, `Z6`, `Z5`, `Z9`, `Z8`, `Z7`, `Z2`, `Z3`, `Z4`).

### Fixed
- Live scouting (`MatchCodeListPanel.tsx`): stopped unsolicited smooth auto-scrolling of the events list on match open/re-import and row deselection; the list now jumps to the bottom once on load and only scrolls inside its own container when new rows are appended.
- Live scouting (`LiveScoutingToolbar.tsx`): kept the "Undo touch" button always visible in the court toolbar (disabled when no touch can be removed in the active rally), matching the behavior of Undo and Events.

## 0.36.0 - 2026-11-19

### Added
- Player performance (`PlayerMultiAutocomplete.tsx`, `PlayerPerformanceDashboard.tsx`): several athletes can now be selected at once, shown as removable chips with a list that stays open while ticking. Each selected athlete gets their own full block of widgets (statistics, radar, situations, evaluations, efficiency, points/errors and heatmap), one below the other, in the order picked. The selection is kept in the filter store (`selectedPlayerIds`), and `filters.player` keeps the first pick so the other dashboards stay consistent.
- Social preview for shared statistics links (`stats-preview.ts`, `vite.config.ts`, `public/social-preview-stats.png`): the link is now `<base>/stats-viewer/#<payload>`. The address without the fragment is a small static page with English Open Graph / Twitter tags and a statistics picture (a player-performance card built from the demo match), which forwards the payload to the viewer inside the app, so chats and social networks show a statistics preview instead of the generic one. Older `#/stats-viewer/<payload>` links keep working, and the page is excluded from the service-worker navigation fallback.

## 0.35.3 - 2026-11-19

### Fixed
- DataVolley import (`datavolley-zone-to-stage.ts`): serves and attacks whose end zone carries a subzone that is not tabulated (for example `6d`, `3a`, `8c`) lost their ball direction and heatmap event ("unsupported zone code"); in the demo match about 70% of them were affected. They now fall back to the base zone (`6`, `3`, `8`).
- Existing DataVolley imports are repaired automatically (`datavolley-direction-repair.ts`, `match-project-storage.ts`): when an imported match is read, touches that lost their ball direction are rebuilt from the stored zone codes and the repaired match is written back once (skipped if the match changed in the meantime). Live-scouted matches are never touched.

### Changed
- Validation (`validate-datavolley-import.mjs`): the committed demo match (`public/samples`) is now validated on every `npm test`, and the heatmap check measures direction coverage on serves and attacks with both zones instead of against all touches.

## 0.35.2 - 2026-11-19

### Changed
- Confirmations (`src/components/confirm-dialog.tsx`, mounted in `App.tsx`): all 15 `window.confirm` calls (team, project, report and system deletion, local data reset, video source removal, code row deletion, restart match, discard team edits) now use an in-app dialog with 44px buttons, consistent on Tauri and mobile PWAs; it falls back to `window.confirm` when the host is not mounted.
- Internal refactor with no behaviour change: team match grouping and form validation moved to tested model modules (`team-matches.ts`, `team-form.ts`), team deletion flows moved to `useTeamDeletion`, and quick-scout types, constants and pure helpers moved to `quick-scout-flow-model.ts`.

### Added
- Tests for the quick-scout flow when the last touch is removed externally (back to receiver selection, then to serve drawing).

## 0.35.1 - 2026-11-19

### Changed
- Share-link popover (`tab-export.css`): on phones and tablets it opens as a bottom sheet inside the viewport, with 44px touch targets for the expiry field and the copy, preview and WhatsApp actions.

### Fixed
- Team deletion with linked matches (`TeamsPage.tsx`, new `team-matches.ts`): matches are now deleted before the team(s), so a failure part-way no longer leaves orphan matches; the match-linking rule is extracted and covered by tests.

## 0.35.0 - 2026-11-19

### Added
- Shareable statistics tabs (`TabExportControl.tsx`, `stats-share-link.ts`, `SharedStatsViewerPage.tsx`, route `/stats-viewer`): the export control now creates an expiring link (1-90 days) containing a compressed SVG snapshot of the current tab, with copy, preview and WhatsApp actions and a standalone public viewer (SVG rendered as an image, bounded decompression, expiry enforced by the viewer).
- Team deletion can also remove the linked played matches (`TeamsPage.tsx`), with a dedicated confirmation and a result message; deleting projects now notes that archived teams and rosters remain saved.
- Import progress banner (`LoadingProgressBanner.tsx`, `LoadDataPage.tsx`): shows the file currently being read or imported.

### Changed
- Opponent report booklet (`report-booklet.ts`, `report-metrics.ts`): sections and attacker cards follow the selected board pieces and setter views; the reception lineup places the libero in the back row from observed reception data.
- Side-out study tab (`AnalysisPage.tsx`, `sideout-distribution.ts`): shown only when the match has side-out distribution data (`hasSideOutStudyData`).
- Team merge panel (`TeamMergePanel.tsx`): shows matches per team; the "similar teams" button label is clearer in all languages.
- Player autocomplete hides a team with no players.

### Fixed
- Quick scouting (`quick-scout-flow-store.ts`): after undoing a reception, the flow returns to receiver selection so the next tap records a reception instead of a player-first attack.

## 0.34.1 - 2026-11-19

### Fixed
- About page version (`src/lib/constants/app.ts`): `APP_METADATA.version` was left at `0.31.8` in the 0.32.0-0.34.0 releases; it now matches the released version.

## 0.34.0 - 2026-11-19

### Added
- Lightweight match summary index (`matchSummaries`, IndexedDB v7) in `match-project-db.ts`, `match-project-storage.ts`, and `match-repository.ts` (`listSummaries`): stores compact match metadata and precomputed results (~400 bytes per match instead of ~1 MB) with automatic transactional sync and one-time backfill, making `LoadDataPage` and `TeamsPage` load almost instantaneously on large archives.
- Bulk import similar-team detection (`bulk-import.ts`, `BulkImportProblemsTable.tsx`): intercepts incoming files whose team names closely resemble an already-archived team (`similar_team`) and lets the user choose **Link to existing team** or **Create new team** directly in the bulk table.
- Team library orphan filter (`TeamLibraryTable.tsx`, `TeamsPage.tsx`): quick **Without matches (`N`)** toggle to isolate and bulk-delete archived teams with no linked matches.

### Changed
- Tactical board SVG editor (`opponent-reports.css`): added touch-friendly `@media (pointer: coarse)` ergonomics (`touch-action: none` on the drawing SVG canvas and `44px` minimum toolbar/property controls for tablet use).

### Fixed
- `.ovs` import team deduplication (`confirm-ovs-backup-import.ts`, `datavolley-team-persistence.ts`): backup archives now deduplicate and restore teams (by `id`, `teamCode`, or normalized name) before importing matches, merging missing players into existing teams and remapping opponent report references instead of creating duplicate team entries; single-match `.ovs` imports now also match existing teams by `archivedTeamId` and `teamCode`.

## 0.33.0 - 2026-11-18

### Added
- Teams library (`TeamLibraryTable`, `TeamsPage`, `TeamMergePanel`, `team-merge.ts`): added **Competition** (`Campionato`) column derived from linked matches, and added similar-team detection, roster/match comparison (distinguishing duplicates vs. same-club/cup cases), and one-click merge with match reassignment.
- Tactical report setter distribution (`SetterViewsEditor`, `attacking-metrics.ts`, `report-view.ts`): added **Reception zone** (`Z1`-`Z6`) and **Receiver engaged** filters plus **Side-out (`SO%`)** metrics per rotation and overall view summary.
- Progressive IndexedDB loading (`match-project-storage.ts`, `archived-team-storage.ts`, `LoadingProgressBanner.tsx`): `LoadDataPage`, `TeamsPage`, `TeamAnalysisPage`, and `OpponentReportEditorPage` now display live item names, `loaded / total` counters, and a `<progress>` bar, while `TeamsPage` loads teams immediately and populates competitions in the background.

### Changed
- Mobile, tablet, and PWA ergonomics across the app:
  - `InteractiveDataTable` and `BulkImportProblemsTable` switch to accessible vertical card-views under `720px` with mobile sort controls and `40-44px` touch targets.
  - Wide statistics tables (`player-stats-by-team__table`, `match-report-table__table`, `cross-rotation-analysis__table`) keep the first column sticky on narrow viewports (`<= 900px`); dashboard filters and `TeamReviewPanel` adapt cleanly to single-column touch layouts.
  - `OrientationGuard` and `PortraitGuard` in live scouting now provide a **Continue in portrait** action (`scoutingContinuePortrait`) to switch to vertical court mode without getting blocked.
  - Enabled `viewport-fit=cover`, `black-translucent` status bar, `touch-action: manipulation`, and `env(safe-area-inset-*)` padding across touch devices.

## 0.32.0 - 2026-11-18

### Added
- Team Review booklet (`TeamReviewPanel`, `team-review-booklet.ts`, `team-review-charts.ts`): structured team and individual player dossiers with reception/serve/attack breakdowns, indicators, match results, team comparison, trends, priorities, and embedded data-study charts, with configurable detail level and full 10-language support.
- Bulk multi-file import (`bulk-import.ts`, `BulkImportProblemsTable.tsx`): clean files are imported automatically without confirmation prompts; live progress bar (`BulkImportProgress`) shows processed/total counts and current filename; problematic files (duplicates, player reconciliations, OVS conflicts, multi-game TieBreak DBs, validation/read errors) are collected in a paginated, sortable, globally filterable table with bulk selection, instant bulk decision application, explicit issue details, and non-destructive single-file preview inspection.
- Shared `InteractiveDataTable` component (`InteractiveDataTable.tsx`): filterable, sortable, and paginated (10/25/50/100 rows) table with page/filtered/individual selection and bulk actions.

### Changed
- Converted all non-scouting lists across the app to `InteractiveDataTable`: Saved Matches (`LoadDataPage`), Team Library (`TeamLibraryTable`), Opponent Reports (`OpponentReportsPage`), Defense/Reception Systems (`SystemsPage`), and multi-match `SelectableTable` (`TeamAnalysisPage`, `OpponentReportEditorPage`), adding bulk delete where applicable.

## 0.31.8 - 2026-11-18

### Added
- Tactical report setter distribution: added `SetterViewsEditor` under the Setter Distribution sheet so coaches can add, duplicate, reorder, and label custom distribution views filtered by serve type (`jump_spin`, `jump_float`, `float`, `other`), serve start zone (`Z1`-`Z6`), and reception band (`all`, `positive`, `negative`), rendered on the board and in the PDF.

### Changed
- Analytics (Trends): promoted **Priorities** (`priorities`) and **Season Trend** (`season-trend`) from Experimental to official always-enabled features.
- Removed **Basic** (`basic`) scouting mode and its tutorial (`scoutingBasic`), leaving **Tag**, **Court**, and **Detailed/Expert**.
- Translations: completed remaining untranslated UI strings in German (`de`), Slovenian (`sl`), Turkish (`tr`), and Chinese (`zh`).

### Fixed
- Tactical report legends: always show sheet legends for `attackers` and `serve` even before manual court edits, and include custom legend entries on `setter` PDF pages.

## 0.31.7 - 2026-11-18

### Added
- Tactical report: added `buildCustomLegendSvg` so custom `legendLabel` entries appear in the sheet footer legend and PDF extras on all tactical sheets, and clarified the legend label hint in the editor.

### Fixed
- Live scouting (Court): `handleRemoveLastTouch` ("Annulla tocco") now calls `syncCourtStateFromLiveMatch()` so tactical phases, court phase, and selected zone update immediately on the court.
- Tactical report court rotation & editor: kept embedded court legends (`data-legend-footer="true"`) unrotated at the bottom when rotating courts (`90°`/`180°`/`270°`), preserved them outside editable shapes, and rendered rotated courts with accurate rotated pointer mapping inside `InteractiveCourtSvgEditor`.
- Tactical report reception courts: preserved `fontWeight` and `isPlayerName` (`data-player-name="true"`) when editing reception SVGs so toggling "Show player names" hides names on edited courts too.

## 0.31.6 - 2026-11-18

### Added
- Set start lineup: added a counter-clockwise rotation button (`rotateTeamSetSetupCounterClockwise`) alongside the existing clockwise rotation so lineups carried over to the next set can be rotated either direction.

### Fixed
- Tactical report PDF (A4): refined attack direction arrow sizing and white text halo (`paint-order="stroke"`), kept duplicated tactical board pieces in their placed order, and prevented player stat tables from splitting awkwardly across pages.
- Import (`.ovs`): link and persist teams through `persistDataVolleyImportedTeams` on `new_match` and `no_common_base` (`use_remote`) imports just like DataVolley (`.dvw`) and TieBreakTech, preventing duplicate archived teams.
- Codebase & docs: replaced all em-dash (`U+2014`) characters with standard hyphens (`-`).

## 0.31.5 - 2026-11-18

### Added
- DataVolley import: parse `[3VIDEO]` (`Camera0=...`) so matches with a YouTube or remote video URL (such as `stuttgart-schwrein.dvw`) pre-configure their video source and timeline automatically in Video analysis.
- Video tutorial: added a direct download link for the sample match file inside the slideshow and removed GitHub-specific wording from the link label.

### Fixed
- Tactical report PDF (A4): avoided duplicating player tables when a board piece is duplicated (`pieceCopies`), grouped board extras to eliminate nearly empty pages, wrapped long arrow legend text under attack/defense courts, and shifted serve ace labels off zone numbers.

## 0.31.4 - 2026-11-18

### Added
- Match statistics: added a conditional **Notes** tab (shown only when the match has notes) with an alphabetically sorted horizontal bar chart of note frequencies, a 5-row paginated/sortable/searchable table (time, note type, score, action codes), and a video hint footer.
- Video analysis: added a dedicated **Notes** table toggle that lets users jump directly to the video timestamp and star/unstar actions for clip export.
- Point notes: added the `funny_gesture` ("Funny gesture") preset tag and persistent custom keywords saved globally in OVS so they can be reused across matches.
- Demo match (`Melodic Spikers - Hollywood Blockers`): enabled automatic first-launch seeding on desktop and mobile (Tauri) builds as well as web, while keeping deletion permanent.

### Changed
- Tag input zone picker: switched the default court orientation to horizontal (left to right) and added a `90°` rotation button cycling through all four orientations while keeping all labels upright and readable.
- Live scouting (Court): when side panels are collapsed, the court and remaining open panels expand to fill the freed space.

### Fixed
- Live scouting (Tag and Court): fixed overlapping action buttons (`Undo`, `Note`, `Touch`, `Events`) on narrow toolbars and mobile screens.

## 0.31.3 - 2026-11-17

### Changed
- Video analysis: moved point notes directly onto action rows (in both single-match and multi-match video views) with inline note pills, a "Notes only" filter, and removal of the separate Notes tab in match statistics.

### Fixed
- Video playlists (Dropbox / remote URLs): allow starting playback before video metadata finishes loading on mobile browsers and display an explicit error if the remote video fails to load.

## 0.31.2 - 2026-11-17

### Changed
- Court mode: after tapping the blocker on a blocked attack (`/`), the evaluation chip now offers `#` (point, default), `=` (block out/error, rewrites attack to `#`), and `/` (net invasion, point to attacker), while confirming or drawing the next gesture keeps `#`.

## 0.31.1 - 2026-11-17

### Added
- Expert code list: added a play button on touch and note rows to jump directly to the recorded video timestamp when a seekable video source (local file, YouTube, or remote URL) is loaded.

### Fixed
- Court mode: switching manually to Freeball in `attack_eval` and selecting `=` now immediately records `F=` and ends the rally.

## 0.31.0 - 2026-11-17

### Added
- Point notes (phase 1): live "Note" button next to Undo in all input modes (Court, Tags, Basic, Expert) with one-tap preset tags (double touch, net/invasion, rotation fault, formation fault, to review) and optional free text, attached to the last touch or rally.
- Notes shown as editable and deletable comment rows in the Tags Codes view and Expert code list, stored in `videoAnalysis.notes` (schema v5, included in `.ovs` export and 3-way backup/sync merge, excluded from DVW export).
- Notes tab in match analysis/statistics with tag filtering and direct jump to the synced video timestamp.
- DataVolley code list (Expert and Tags Codes view): insert a missing code line before the selected row (`Ins` or Insert button) or at the end of the rally, edit (`Enter` or Edit button), and delete (`Del` or Delete button with confirmation), rebuilding score, rotations, stats, and DVW export.
- Settings & Quick new match: added global default and quick-start checkbox for "Libero replaces middles by default" (`liberoAutoMiddleReplacement`, on by default); when off, tapping the libero outside the court in Tags or Court assigns touches directly without automatic or recorded libero exchanges.

### Changed
- Video synchronization: moved the active calibration bar directly under the video player with Play/Pause and `-1 s` / `+1 s` controls; added automatic reaction-time compensation for Rapid Sync above `1x` speed.
- Court mode: added `=` (block out/error) and `/` (net invasion) to the live block deflection evaluation chip (`block_eval`).
- Quick new match: added an inline "full setup" link directly below the intro subtitle.
- App and PWA update notifications: displayed as a centered modal dialog instead of a corner toast/banner.

### Fixed
- Remote video URLs (Dropbox / direct MP4): fixed React effect ordering bug that kept `isPlayable` disabled, added explicit error feedback when a remote video cannot be loaded, and enabled the `?` help notice for remote URL sources.

## 0.30.3 - 2026-11-16

### Added
- About: tabs (Project, Tutorials, Data and apps, Downloads, Contact,
  Credits); Downloads lists the files of the latest release for Android,
  Windows, macOS and Linux, read from GitHub.
- Settings: tabs (Display, Scouting, Shortcuts, Analysis, Experiments,
  Maintenance).

### Changed
- App menu: on narrow screens a "Menu" button opens all the pages in a panel
  (closes on a choice, a tap outside or Escape); wide screens keep the row.
- Live scouting on upright tablets: side panels (code list, opponent attacks,
  code input) start closed and open from buttons in the header.

### Fixed
- Translations of the new tabs in every language (English and Italian had
  some labels swapped).

## 0.30.2 - 2026-11-16

### Fixed
- Court and Expert: Hard / Placed / Tip on the toolbar when the skill is
  Attack, before the attack is drawn or typed (hard unless changed; a code
  typed with its own subtype keeps it).
- Tags: during a suggested compound play every evaluation stays usable (the
  suggested ones highlighted): a block error (=) or an invasion (/) can be
  tagged after an attack.

## 0.30.1 - 2026-11-16

### Changed
- Tags: choose Hard / Placed / Tip before recording the attack evaluation,
  directly below the skill buttons. Hard is preselected for each new play.
- Match setup: optional details in new matches and editable details for
  recorded matches; live Exit offers statistics, suspend and restart actions,
  with clearer live header buttons.

### Fixed
- Tactical report PDF: haloed labels remain readable and turned courts keep
  their labels inside the frame.

## 0.30.0 - 2026-11-16

### Added
- Tags zone picker: the whole court, arrival above (the other team's court)
  and start below (own court: 5 6 1 for a serve, any zone for an attack);
  it closes when both are given, or with Done / Skip. On short phone screens
  the two halves sit side by side.
- Tutorial "Tags scouting" retaken on the new keypad (17 slides): serve,
  compound reception suggestion, attack, zones, undo, block by hand, point
  without a touch, substitution keypad, Codes view.
- New match: the five questions come one page at a time, numbered 1-5, with
  Back and Next (answers are kept when going back). Two boxes beside the
  court for the liberos (proposed from the roster; a new number joins it as
  libero).
- Tutorial "Getting started" rewritten on the new-match page: the five
  questions, the start, then each mode's own tutorial.
- Tags: "Codes" shows the list of DataVolley codes entered (the same list as
  Expert, with corrections), "Back to the keypad" returns.
- Tags keypad on the VolleyReportXLS model: player and skill in either order,
  then the evaluations, best to worst, in the VolleyReportXLS colours; the keys
  show the symbol only, the legend beside says what each means. Skill keys
  with letters in the order serve, attack, reception, block, set, dig, free
  ball (Italian B A R M P D F, DataVolley S A R B E D F in the other
  languages; the codes stay DataVolley's), reduced (4) or full (7)
  set chosen in Details. Liberos beside "Substitution".
- Tags with both teams: each team framed in its colour with its name; side by
  side, or one above the other (opponent at the top, home at the bottom) on
  narrow screens or by choice. Compound codes suggested: after a serve the
  other team's reception (who received the ace, R preselected with the
  evaluations the serve allows), after an attack the block or the dig.
- Tags: the skill keys show the DataVolley codes S R E A B D F, with the name
  small underneath; free ball is now among them.
- Tags: shorter outcome buttons; above them the zone picker and attack type,
  with beside them a legend of what each evaluation means for the current
  skill, in DataVolley's wording. On phones held sideways everything fits
  the screen (the legend waits while the zone picker is open).
- Tags: optional zones for serves and attacks. After the play a small picker
  asks where the ball went: 9 zones on phones, zones with subzones (A-D) on
  tablets and computers; for serves also the start zone (5, 6, 1). Written
  as DataVolley zone codes, so DVW export, heatmaps and serve charts use
  them. "Skip" leaves the play without zones, as before.
- Attack type: after an attack, one tap on Hard / Placed / Tip (DataVolley
  skill subtype H / P / T), Hard by default as in DataVolley. Every attack is
  written with its subtype in the DVW export and read back on import;
  "P" is now imported as a placed shot, no longer as a tip.

### Fixed
- Live scouting: the video button is a camera, round and coloured, in every
  input mode, with "Video" shown on hover.
- Rosters: no limit on players or liberos and no FIVB composition checks
  (more than two liberos was an error): OVS records, it does not referee.
  Only one libero is on court at a time, as before.
- Tags: "Codes" sits beside "Details" (the video button covered it).
- DVW import: a file whose set summary disagrees with its rallies (seen in
  VolleyEye exports) showed a red alert and "Import anyway", so it looked
  rejected. Now a yellow notice says the match imports with the rallies'
  score and to check it; the button is a plain "Import".
- Tags / Basic: no more placeholder zones in the DataVolley codes (a serve
  showed a start zone 8 nobody chose); only zones picked on purpose are kept.
- Tags: during a suggested compound play its allowed evaluations stay lit.
- Phone header: a long opponent name is cut at its end, not at its start.
- Evaluation charts: the tooltip shows every evaluation, no longer cut by
  the chart below.

### Added
- New match on one page: your team, who you scout (only your team or both),
  the starting lineup, who serves first and the input mode, then straight to
  the first rally. Rules and date take their defaults; the old wizard stays
  as "Full setup".
- Lineup rebuilt from the serves: in Court, Expert and Basic, when your team
  is about to serve with nobody in position 1, OVS asks who is serving and
  completes the starting lineup (Tags already did).

## 0.29.0 - 2026-11-16

### Fixed
- Tactical report PDF: the percentages on the serve heatmaps (and other
  labels with a white halo) were white on white; the halo is now drawn under
  the text.
- Turned courts: labels near the edge are no longer cut, the court's frame
  grows to hold them.

### Changed
- Team booklet: single pages are exported on A4 (no more A5); the booklet to
  fold stays on A4 sheets.

### Added
- Rotate court charts by quarter turns with labels kept upright: every court
  of the tactical report (button "Rotate" under each court, kept in the
  booklet, PDF and shared link) and the heatmaps of the data study.
  "Rotate every court on the sheet" turns all the courts of a sheet together
  (attackers, servers, setter, reception P1-P6...). "Reset" puts a court,
  or the whole sheet, back upright.

## 0.28.3 - 2026-11-15

### Fixed
- Added the missing acknowledgements description in all supported languages,
  fixing the locale parity tests that blocked the Android release build.

## 0.28.2 - 2026-11-15

### Changed
- About: expanded acknowledgements and unified contributor descriptions.

### Fixed
- Court scouting: changing the proposed skill before selecting a player now
  updates the selection hint and rally continuation, allowing a Freeball
  pass to be recorded without treating it as an attack.

## 0.28.1 - 2026-11-15

### Changed
- Home: the tutorials are a row of buttons; "Scouting" opens its input
  modes in a row on hover (tap on touch screens).
- About: tutorials grouped (getting started, scouting by mode, after the
  match) as cards with a one-line description each.

### Fixed
- Italian: the set skill is "Alzata", not "Palleggio".

## 0.28.0 - 2026-11-15

### Added
- Team data study: new "Team booklet" tab, a review booklet of your own team
  over the selected matches: record, season trend, training priorities
  (against the matches won), side-out and break point by rotation, player
  cards with a QR code to each player's attack video, and staff notes kept
  per team. Exports an A5 PDF, an A4 booklet to fold, or a web link.

### Changed
- Tutorial "Court: a full rally with every variant": the team header uses
  the demo coaches, like the demo match.
- Removed public/samples/new_test.dvw, a real league match that was only
  used by tests and was published with the web app; the tests now use the
  demo match Melodic Spikers - Hollywood Blockers.

## 0.27.1 - 2026-11-15

### Added
- About → Tutorials and home "scouting" menu: "Court on a smartphone", the
  Court tutorial on an upright phone with the vertical court
  (#/tutorial/court-phone).

### Changed
- Live scouting: the help button (and the welcome card's manual) opens the
  tutorial of the input mode in use, over the match, instead of the old
  four-line manual.

### Added
- About → Tutorials: "Basic scouting" (serve and point) and "Expert
  scouting" (DataVolley codes) tutorials, one slide per gesture like Tag and
  Court; all four input modes now have their tutorial, in the same order as
  the mode chooser, with their own addresses (#/tutorial/basic, tag, court,
  expert) and social preview pages.

### Added
- About → Tutorials: "Court scouting" tutorial, one slide per gesture with
  a pulsing finger for taps and a finger travelling along each drag: serve,
  receiver, reception evaluation, attack, attacker, result, point, then a
  rally with Melodic Spikers receiving and an undo. Home "scouting" → Court
  opens it (address #/tutorial/court); the former DataVolley rally replay is
  kept as "Court: a full rally with every variant" (#/tutorial/court-rally).

### Added
- Tutorials: shared links show their own title and picture in chats and
  social networks. The web build writes a small page per tutorial,
  <base>/tutorial/<slug>/, that leads into the app; while a tutorial is open
  the address bar shows that link, ready to copy. New tutorials get their
  page automatically (src/features/landing/tutorials/tutorial-previews.ts).

## 0.27.0 - 2026-11-15

### Changed
- Input modes: "Detailed" is now "Expert" ("Esperta" in Italian).
- Tutorials: each has its own address (#/tutorial/getting-started, court,
  tag, video, tactical-report) to share; the address bar shows it while the
  tutorial is open. Home: "scouting" opens a menu with the tutorial of each
  input mode (Court, Tag). The former "Scouting" tutorial is "Court scouting".

### Added
- About → Tutorials: "Tag scouting (buttons only)" tutorial, one slide per
  gesture on the real app (choose Tag, serve, reception, attack kill, undo,
  another skill, point with no touch, substitution and jersey keypad) with a
  slowly pulsing finger where to tap; Next moves to the following gesture.
  Taken on Melodic Spikers - Hollywood Blockers by
  tools/docs-screenshots/record-scouting.mjs, which also records the tap
  positions.

### Changed
- Tag input: the "Bench / #" button is now "Substitution / number" (it opens
  the bench and the keypad, and records a substitution when the court is
  full); the empty keypad shows a dash instead of "#", which is also an
  evaluation; neutral wording for "came in as a substitute".

### Changed
- Tactical booklet: the "Attackers: description only" page shows each
  attacker as a heading with readable "situation: value" lines, without the
  empty rows and the misleading direction count.
- Video analysis: frame-by-frame stepping follows the real frame rate of the
  video (measured while it plays), 1/30 s only until it is known.
- Multi-match video analysis: saved filters and fine tuning (Q / W on the
  selected action, frame stepping, save frame), as in single-match analysis.
- Italian: neutral wording in two new texts (substitution message, lineup
  correction in the user guide).

## 0.26.19 - 2026-11-15

### Fixed
- Court input: a team with nobody in position 1 (a position left empty, or a
  player placed in the wrong one) can serve again; the serve is recorded for
  the team instead of the app waiting on "drag the serve".
- Lineup on court: typing, in an empty position, the number of a player who
  started in another position offers to move them there (no substitution
  needed to fix a misplaced player).

### Changed
- Tag input: all six evaluations of each skill (e.g. attack "!", reception
  "!" and "/"), worst to best in the order of the skill's scale and with the
  shared evaluation colours.
- Tag input: jersey numbers 0-99 on a keypad, two digits enter the number at
  once, instead of the 1-30 / 31-99 grids.

## 0.26.18 - 2026-11-15

### Changed
- Tutorials: both now start from where to click (menu, match card, tab),
  with the target highlighted; screenshots retaken with the cleaned demo
  match and without the domain-move notice.
- Home: the tutorial line links each tutorial directly (getting started,
  scouting, video and sharing, tactical report).
- About: link to download the Stuttgart - Schwerin match used by the video
  tutorial from GitHub.
- Demo match: renamed people and places; browsers holding the previous demo
  get the new one once (a deleted demo stays deleted).

## 0.26.16 - 2026-11-14

### Added
- Web app: the match Melodic Spikers - Hollywood Blockers is preloaded as a
  demo on the first visit, with a notice on its card; it can be deleted like
  any match and is not imported again.
- About → Tutorials: two new slide-show tutorials made of real screenshots,
  "Video and sharing" (sync, rapid sync, filters, share links, web player)
  and "Tactical report" (from the matches to booklet and web link). Italian
  and English screenshots; the other languages use the English ones.

### Changed
- The video and tactical report tutorials moved from the GitHub docs into the
  app.

## 0.26.15 - 2026-11-14

### Added
- Video analysis: fine tuning of the selected action from the keyboard
  (Q / W move it 0.5 s earlier or later, with Shift 0.1 s) or with buttons
  under the video; with a local video also frame-by-frame stepping
  (Shift + ← / →) and "Save frame" as a full-resolution JPEG.
- Video analysis: saved filters - store the current filter combination under
  a name and bring it back on any match.
- Development: `npm run release -- patch|minor|major|x.y.z` bumps the version
  in all six files and turns the CHANGELOG "Unreleased" notes into the new
  version's entry.

## 0.26.14 - 2026-11-14

### Added
- Live scouting with the video in the app: each action takes the video time
  of its first tap on the court (or first key in the code input), not of its
  confirmation, so the typing time is no longer added.
- Video analysis: "Delay per skill" moves every action of a skill by the same
  seconds (e.g. all serves −2 s); actions with their own sync point are left
  as placed. Used by playback, DVW export and report video links.
- Video analysis: a correction on a serve also moves its reception, one on an
  attack its block and dig.

### Added
- Documentation: two step-by-step tutorials with screenshots, in English and
  Italian - preparing a tactical report, and synchronizing the video and
  sharing the actions with the web player. The user guide gains a tactical
  reports section and the new video synchronization behaviour.

### Changed
- Tactical reports: the attribution line now kindly asks not to remove it,
  instead of stating a requirement.
- Documents produced by OVS (reports, booklets, exports) sign the author as
  "napo"; the full name stays on the software licence, the About page and
  the metadata of exported files.

## 0.26.13 - 2026-11-14

### Added
- Video analysis: a notice on matches not scouted in real time explains that
  they need one rapid-sync tap per rally, and the actions of rallies without
  a sync point show their time as approximate (`≈`).
- Video analysis: "Intra-rally timing" says when the mode was chosen
  automatically.

### Changed
- Video analysis: on matches not scouted in real time, rapid-sync taps made
  with earlier versions now also apply from their rally on, without having
  to redo them.
- Sync points: the scope button cycles through "from here on", "this action
  only" and, where available, "this rally only".

## 0.26.12 - 2026-11-14

### Changed
- Video analysis: matches that were not scouted in real time (from a video
  with pauses and rewinds, or typed after the fact) are now recognized from
  their clocks. For these matches "Intra-rally timing" defaults to the
  realistic cadence, with counter-attacks at a fixed pace instead of the
  recorded gaps, and every rapid-sync tap applies from its rally on, so the
  rallies not tapped yet follow the nearest tap before them. The choice can
  still be changed per match.

### Fixed
- Video analysis: a sync point keeps marking its action when the intra-rally
  timing mode changes, instead of drifting with the action's old clock.
- DataVolley export and tactical-report video links use the same intra-rally
  timing as the Video tab.
- "Move everything" on a match with DVW video times no longer drops or cuts
  into a rapid-sync tap.
- Rally-scoped sync points are listed with the anchors, not with the
  per-action corrections.
- Realistic timing keeps free balls and covers before the next set and attack.
- Multi-match video panel: styled timing and interpolation selectors, and
  the action lists are no longer rebuilt at every star or sync point.
- Tactical booklet: the attribution line is printed at a readable size on two
  lines.
- The About page shows the right version again (it was stuck at 0.26.9).

## 0.26.11 - 2026-11-14

### Added
- Video analysis: "Intra-rally timing" option with a realistic rally cadence
  anchored to the serve.
- Tactical reports: attribution line in the footer of PDFs, booklets, images
  and shared pages.

### Fixed
- Video analysis: an anchor placed inside a rapid-synced rally takes
  precedence from that action on.

## 0.26.10 - 2026-11-13

### Fixed
- Video analysis: a rapid-sync tap on a match that already has a baseline
  corrects its own rally without shifting the following ones.
- Video analysis: sync points on matches played across midnight.

## 0.26.9 - 2026-11-13

### Changed
- Tactical reports: replaced en-dashes (`–`) with `-` across the app, updated
  "Serve targets" to highlight the least effective side-out court zone, added
  a sheet-level toggle to show/hide receiver names centered below player dots
  without overlap, and marked the setter with a hollow dot and grey dashed ring
  in all rotations P1-P6.
- Tactical reports: replaced long top help paragraphs on "Serve targets",
  "Block and defence", and "How they serve" with compact icon legend boxes at
  the bottom of each sheet (both interactive and PDF) that adapt dynamically to
  edited colors and custom-labeled shapes.
- Drawing editor: added a light dashed post-first-touch movement arrow tool
  (`M`), a "Voce in legenda" prompt when inserting new elements, and moved the
  "Most frequent zones" serve heatmap editor button into the drawing toolbar.

### Fixed
- Serve heatmap percentage labels now always render in dark text with a white
  outline for legibility on red cells.

## 0.26.8 - 2026-11-12

### Changed
- Tab PDF/PPTX export preserves the laptop HTML visual layout across A4
  landscape pages without slicing charts, cards, table rows, or text lines.
- Tactical reports: unified into a single adaptive Booklet (alongside A4) that
  automatically adds lined notes pages when needed and places compact video QR
  codes directly beside athlete names on their cards.

### Fixed
- Tactical reports: opponent team selector remains editable when reopening
  report sources so any team in the match can be chosen; all sections and
  sheets defined in the draft (including block/defence) are included in every
  export format.

## 0.26.7 - 2026-11-12

### Fixed
- Match report PDF export from single-match team study and match analysis
  now uses the exact end-of-match report layout (`exportMatchReportPdf`) and
  fits cleanly on 2 A4 pages (page 1: both team tables; page 2: final summary).
- Tab PDF export now generates native vector `pdfMake` output (SVG charts,
  native tables, selectable text) adapted to A4 landscape with 2-3 charts/widgets
  per page and no cut graphics.

## 0.26.6 - 2026-11-12

### Changed
- Live scouting (Tags): guided four-outcome pad following the rally flow
  (`serve → receive → attack → block / dig`), automatic set insertion
  before attacks, setter calls in Details, probable-player highlighting,
  and localized role badges (`P`, `S1`, `S2`, `C1`, `C2`, `O`, `L` in Italian).
- Video analysis: replaced long sync-point and archived-playlist lists with
  filterable, scrollable, paginated tables (5 / 10 / 20 / 50 rows).

### Fixed
- Side-out study: "By call" view now groups by setter call (`K1`, `K7`, …)
  instead of attack combination (`X5`, `V6`, …).
- Analytics export: included `HeatmapWidget` in PDF, PPTX, ODS, and SVG
  exports; fixed Side-Out Study courts rendering solid black and splitting
  across page boundaries in PDF/PPTX exports.

## 0.26.5 - 2026-11-12

### Added
- Video analysis: share playlists with WhatsApp-ready split links, QR codes,
  clipboard copy, or an `.ovsp` file. Local-video playlists play in the
  browser after the recipient selects the original video; it is not uploaded.
- Video analysis: save titled playlists in a per-match archive, included in
  OVS exports and full backups.
- Analysis: export the current tab as PDF, PPTX, ODS, or SVG.

### Changed
- Video analysis: configure the time padding before and after each action.

## 0.26.4 - 2026-11-12

### Added
- Video analysis: rapid synchronization. Let the video play (even at 1.5x
  or 2x) and press one button each time the serve shown starts: the rally
  is lined up from there on and the next serve comes up. One tap per rally
  instead of pausing, seeking and confirming for every point; with "Skip
  this serve" and "Undo last". Meant for matches scouted live, where the
  gap to the video changes from rally to rally.

## 0.26.3 - 2026-11-12

### Changed
- Video analysis: the sharing buttons (link, HTML player, YouTube
  playlist) moved below the action list, so the list sits right under the
  video and filters while synchronizing.
- Video analysis: actions that carry a sync point are marked in the list
  (highlighted ⌖ and a coloured edge), so a jump in the time column can be
  traced to the point that causes it.

### Fixed
- "Move the whole synchronization" moved every action, including the ones
  already corrected, with no way back. The box now says so, points to "Sync
  from here on" for partial fixes, and has "Undo the move".

## 0.26.2 - 2026-11-12

### Added
- Live video: jump back or forward by 5 or 10 seconds (−10, −5, +5, +10
  around Play), for local files and YouTube, also in the pop-out window.
  Before, only "back 10 seconds" was available.

### Changed
- Evaluations use one scale and one palette everywhere, the same as
  VolleyReport: green for what goes well to red for what goes badly, by the
  place on the skill's scale, not by symbol (on a serve "/" is second best
  and light green; on a reception it is orange). Live scouting buttons are
  now coloured and ordered by the chosen skill; the rally timeline, the
  dashboard charts, the Priorities bars and the direction heatmaps follow.

- Shared video links: a warning when the link is long enough that some
  chat or mail apps may cut it, with the way out (fewer actions, or the
  HTML player file).

### Fixed
- Shared video links: a playlist too large for the player (over 2,000
  actions, or a link over 200,000 characters) produced a link that silently
  failed to open. It is now refused when the link is made, with an
  explanation.
- Shared video links are unpacked with a size limit, so a link crafted to
  exhaust memory is refused.
- Serve charts ranked "!" above "+"; the serve scale is # / + ! - =, as the
  button labels already said.
- Floating live video panel: at its default size the picture shrank to
  nothing and "Remove video" fell out of view under the controls. The panel
  now opens larger (320×300) and never gets smaller than the picture plus
  all the controls; panels saved at the old size are enlarged automatically.

## 0.26.1 - 2026-11-11

### Changed
- Getting-started tutorial: two new slides. One explains that leaving the
  away roster empty records the opponent as a team only; the other shows
  the four input levels (Basic, Tags, Court, Detailed) with the one
  recommended for the device. It no longer asks for a full away roster.

### Fixed
- Rally tutorial on a phone held upright: it now uses the vertical court
  with live-scouting marker sizes; before, the court was tiny, markers
  overlapped and the button bar was broken.
- Tutorials on phones: long captions no longer slide under the Back / Next
  buttons.

## 0.26.0 - 2026-11-10

### Added
- Scout one team only on the court: leave a team's match roster empty and
  it is recorded as a team. Set start skips its lineup, the court shows one
  team marker (the first letters of its name) instead of six empty
  positions, and its receptions, attacks, blocks and ace victims are picked
  automatically, so only the outcome is entered. Its touches are exported
  as `$$` (`00` for a serve), like a team-only DataVolley file.
- Phone held upright: the vertical court nearly doubles in size and sits
  on the left; a column on its right shows the next-step hint and the
  touches of the rally so far. Player markers follow the court size and no
  longer overlap; dig, freeball and cover buttons are hidden (the flow
  proposes them) unless one is active.

- Experimental (Settings → Experimental features): "Predict the attacker".
  After an attack is drawn, the player closest to where it starts is
  highlighted; entering the evaluation confirms them, tapping another
  player changes them.

### Changed
- Substitutions: a re-entry that breaks the classic rule (back only once,
  only for the player who replaced you) is recorded with a ⚠ warning
  instead of being refused. The scout records what happens on court.
- The "optimized for large screens" pop-up is gone; the note about video
  on small screens is a plain statement.

### Fixed
- Linux .deb: installing failed on systems with the distribution's ffmpeg
  ("trying to overwrite '/usr/bin/ffmpeg', which is also in package
  ffmpeg"). The bundled tools are now installed as `ovs-ffmpeg` and
  `ovs-go2rtc`, so they no longer clash with system packages.
- Upright phone: the court no longer runs under the button bar, and the
  truncated "S.." label in the header is gone.
- New and imported matches start at the current data version instead of
  being upgraded on first load.

### Documentation
- The four input levels (Basic, Tags, Court, Detailed) are documented;
  pages describing retired scouting modes were rewritten.

## 0.25.2 - 2026-11-10

### Added
- Live video: a seek bar with elapsed / total time under a local video
  (also in the pop-out window); before, only skip-back, play and speed.

### Fixed
- Opening the events panel (to undo something, or on a libero proposal)
  closed a local video and sent a YouTube one back to the start of the
  match. The video now stays on screen and keeps playing beside the panel,
  so the event can be checked on it.
- Undo after a libero exchange made by a tap during a rally removed one
  touch too many. A substitution recorded during a rally no longer clears
  the whole undo history.

## 0.25.1 - 2026-11-10

### Added
- Set setup warns when roles don't follow the team's role order counted
  from the setter (e.g. an outside hitter labelled as a middle), and when a
  player starts in another kind of role than in the previous set.
  "Realign roles" re-proposes the order from the setter.
- "Correct starting lineup" in the events panel: while the set is 0-0 and
  no rally has been played, the set setup can be reopened and fixed.

### Fixed
- Live scouting: after switching liberos, a libero entry dialog with the
  set's first libero reopened every time it was closed and blocked the
  match. Entries now come only from a tap beside the court; mandatory
  exits (front row, service) stay automatic.
- Libero tap: the libero comes in for the players they actually replaced
  (this set, then earlier sets) rather than for whoever carries a middle
  label; when both middles are unavailable (front row and serving) a tap
  no longer sends the libero in for an outside hitter.
- The libero who comes in becomes the first libero, so later proposals
  offer them instead of the one chosen at set start.

## 0.25.0 - 2026-11-09

### Added
- Import messages (warnings and notes of the DataVolley/Tiebreak import)
  are shown in the app language.
- Settings: an index at the top jumps to each section; language and sizes
  are grouped under "Language and display".

### Changed
- Trends, rally model: each state says whose touch it is ("Us · Attack #",
  "Opponent · Attack #"). Before, our kills and the opponent's were blended
  into one row with a meaningless probability.
- Trends: rotation bars labelled P1-P6, season trend axis shows match
  dates, similar pairs are no longer listed twice, no repeated heading.
- Tactical report attack cards: zone 4 and zone 2 attacks start near the
  antennas instead of a sixth of the court in.
- Systems: the system is chosen only from the sidebar list.
- Count strings read "Label: N" in every language, so one item no longer
  shows wrong plurals like "1 rallies".

### Fixed
- PPTX/ODP exports: the serve heatmap printed every zone in the same full
  red; zones are shaded again.
- Tactical report: an attacker with no scouted directions printed an empty
  court (now described in text); a table continuing on a new page took a
  player's name as page title.
- Rotation computed from a fractional court position could return a
  fractional rotation.

### Development
- `npm run lint` checks for unused code (TypeScript compiler) and runs first
  in `npm test`; about 800 lines of unused code were removed.
- `test:vitest` runs every vitest file in `src`; `vitest.config.ts` keeps
  node:test files out, so vitest can run on any folder.

## 0.24.2 - 2026-11-09

### Added
- Tactical report: team indicators of the opponent (side-out, FBSO, MTRP,
  CP length, break point, AST, counterattack, BP length) under the
  priorities and on the first booklet page.
- Tactical report: setter charts (per reception band) and serve charts link
  to a YouTube playlist of those actions when the match video is synced,
  like attack and reception cards. The printed booklet ends with a Video
  page with one QR code per chart that has video.

### Fixed
- FBSO and AST missed most first-ball and transition kills: DataVolley
  files write the opponent's dig or block row after the kill, and the kill
  had to be the very last touch. Values were underestimated everywhere
  (dashboard, radar, Trends).
- "Reset filters (6)" was shown with no filter set; a team fixed by the
  page no longer counts as a filter either.
- Phones: analysis tabs wrap instead of hiding three of five, and radar
  labels wrap instead of being cut.
- Team names are no longer cut in the situation metric cards.
- Player Performance shows "–" instead of "0%" when the team total is zero.
- Video analysis: disabled buttons look disabled, a line explains that a
  video is needed, and matches are labelled with opponent and date.
- Team study: "Change selection" is a visible button; the match count
  reads "Selected matches: N". Match selection is a searchable table and
  play-by-play opens on a match with points.
- Evaluation charts count every block evaluation.
- The domain move notice writes the date with the month name.

## 0.24.1 - 2026-11-08

### Fixed
- Tactical report attack cards showed left and right swapped: attacks from
  zone 4 appeared where a zone-2 attacker stands. The attacker is drawn at
  the top facing down, so zone 4 is now on the card's right, opposite your
  zone 2. Serve diagrams and the other report charts were already correct.
- DVW files whose setter zones and lineups never rotate within a set (an
  exporter bug) gave rotation-based analyses only the set-start rotations,
  e.g. empty rotations in the tactical report setting study. The importer
  now rebuilds the rotations from the side-outs; re-import affected matches.
- The setter declared in a DVW file ("*P"/"aP") is used even when the file's
  roster lists her with another role; before, whoever stood in her slot was
  taken as setter. Re-import affected matches.
- DVW score jumps (points awarded by the referee, e.g. red card or rotation
  fault, without scouted rallies) are added as points without actions, and a
  point row repeating the score (annulled and replayed rally) no longer
  counts: imported sets now match the official score.

## 0.24.0 - 2026-11-08

### Added
- New home organised by work moment: an "In progress" card for an open
  match (teams, sets, current score, "Continue scouting"), then Match,
  Analysis and Archive groups, with the tutorials linked below. The hero
  shows the ball mark with the name as text.
- Video analysis and team data study open a picker: a scrolling table with
  a search over every column and the last used item first.
- Tactical report matches are chosen from a searchable multi-select table
  (opponent, date, competition, result, similarity).

### Changed
- "How they serve" diagrams: target zones shaded as a heatmap with their
  share, the four main routes as arrows whose width follows their share,
  and a dashed arrow on the route with most aces (replaces the cones).
- Italian: "atleta" replaces "giocatore", with neutral plurals.
- Vertical court on wide screens without a video: the video panel shrinks
  to a strip and the opponent analysis panel fills the sidebar.

### Fixed
- The match report no longer shows "0 – 0 ()" before the first set or "-"
  for a missing venue.
- Lineup drafts of deleted matches are removed.
- The team study video setup (local file, YouTube) is readable: it no longer
  sits inside the black player box.

## 0.23.0 - 2026-11-08

### Changed
- Match setup: team name suggestions work with the keyboard (arrows, Enter,
  Escape) and default to the existing team, so Enter no longer creates a
  duplicate; the wizard announces the steps that follow and its last button
  reads "Continue: scoring rules".
- An empty match roster shows "you can add players during the match"
  instead of "Ready".
- Live scouting fits tablets: compact header labels and chips, icon-only
  score undo in portrait, a one-row status line, and skills on two rows.
- Portrait screens (tablets too) switch to the vertical court and close the
  code list; landscape restores the previous orientation.
- Without a video for the match the floating video panel starts closed, so
  it never covers the court.
- The input mode chooser uses the same order as the header switch.
- Statistics actions show their labels; the empty statistics page links to
  the Data page.
- Systems actions sit on one row; the team library has compact actions and
  hides coach columns on phones; settings are centred with a translated
  "Maintenance" section; About opens with the tutorials.

### Fixed
- The unfinished set setup (lineups, step) survives a reload or restart.
- Renaming a team picked from the archive no longer carries its roster to
  the new team.
- Match report tables (screen, print, PDF) are aligned when no set has been
  played yet.
- Scoring setup inputs stay inside the card; the golden set target is shown
  only when enabled; missing venue or time is omitted from the summary.
- Last names in the match roster no longer use a monospace font; remove
  buttons are visible and labelled "Remove player" in every language.
- The licence is named "GNU AGPL v3 or later (AGPL-3.0-or-later)" on the
  About page.

## 0.22.0 - 2026-11-07

### Added
- "How they serve" tactical sheet: full-court diagrams drawn left to right,
  one strip per main serve type, start-to-target cones grouped as often,
  sometimes or rarely, an arrow on the route with most aces, and serves,
  errors, aces, difficult serves and average serves in a row. The six main
  servers fit on one page; the others are listed as text or on an optional
  extra sheet. Without scouted serve directions no sheet is printed and the
  known serve facts go to the staff notes.
- Summary at the end of a multi-file import (imported, with warnings,
  skipped or failed), returning straight to the match list.
- Prominent alert and "Import anyway" button when a DVW set score differs
  from the replayed rallies.
- The match report footer asks to keep the author's name, as the software is
  free.

### Changed
- Tactical reports are a regular feature: no longer behind the experimental
  setting, always in the menu, the Teams page and the Settings thresholds.
- The reaction after a conceded break (go-to attacker, serve after the break
  side-out) is printed under the priorities in every booklet.
- The block and defence sheet is optional in every booklet format.
- PPTX and ODP exports have their own toolbar entry; export, preview and
  share menus open as overlaid dropdowns that close after a choice.
- Import diagnostics show translated severity labels and the file row, with
  technical notes collapsed.
- Side-out and break-point rotation priorities state their game phase.
- Finished matches show statistics as their main action; deleting a match is
  a quiet secondary action, and the backup banner reads "Back up now".
- Phone navigation fades its trailing edge and keeps the current page in view.
- The report editor suggests the compact booklet when blank notes pages pile
  up, and explains when team similarity is not available.
- Smaller landing logo, so the main actions are visible without scrolling.

### Fixed
- The import preview reports the same warnings as the confirmed import.
- Unplayed DVW set slots no longer appear as "5: -" in the preview.
- Leaving "Create tactical report" without any choice no longer leaves an
  empty "Untitled report".
- The component navigator counts priorities and rotations correctly, and
  English/Italian counts no longer read "1 matches" or "1 items".
- Report editor header padding, compact priority actions, and a stray grey
  line at the right edge of the landing logo.
- The About page showed version 0.20.0 in release 0.21.0.
- Rally "Point to" buttons showed a raw `{{team}}` placeholder in several
  languages; batch-import strings are now translated in every language.

## 0.21.0 - 2026-11-07

### Added
- Editable PPTX and OpenDocument (ODP) tactical booklet exports, alongside SVG
  pages, sharing the complete A4 report layout, editable text and vector courts.
- Compact, extended and custom tactical booklets with exact page/sheet previews,
  A5 reading PDFs and A4 duplex booklet imposition, optional opponent serve and
  secondary-setter diagrams, original SVG geometry and compact attribution.
- Up to ten reorderable tactical priorities with three primary positions,
  optional secondary print positions, reserves, editable coach text and
  language-independent automatic templates.

- A vertical component navigator supports drag and keyboard reordering, focused
  editing, and a shared section order across export formats.
- Staff notes expose generated summaries alongside manual notes, with persistent
  coach edits, exclusions and restoration of calculated text.
- Reconcile same-name players with different jersey numbers during DVW import;
  distinct namesakes require a role, birth year or identifying note.

### Fixed
- Restore first-ball setting distribution after archived-player reconciliation,
  including reports affected by stale setter references.
- Preserve square courts, reception rotation grids, both reception bands for
  setters, attack directions and coach descriptions across report layouts.
- Keep secondary setters descriptive by default, with optional charts, and
  support descriptive-only attack cards for selected players.
- Fix PPTX and ODP export for arrow markers with a null viewBox; preserve the
  PDF typography and marker sizes, and keep preview URLs out of staff notes.
- Rank tactical proposals using observed point contribution, exposure and
  sample reliability. Compare receivers within the same rotation, require
  both samples and avoid unsupported transition-phase instructions.

### Changed
- License the software under GNU AGPL v3 or later (AGPL-3.0-or-later).

## 0.20.1 - 2026-11-07

### Added
- Import multiple match files in one selection, with sequential previews,
  duplicate decisions, warning acknowledgement and an option to skip failed files.
- Choose day/month or month/day ordering for ambiguous DVW dates; the selection
  applies to subsequent DVW files in the import queue.

### Fixed
- Hide backup, export and archive controls during import until returning with Back.
- Ignore empty DataVolley set slots marked True instead of creating phantom sets
  and missing-starter warnings.
- Read extended DataVolley text fields to preserve Turkish names and normalize
  dot-separated match times to ISO timestamps.
- Report substitutions inconsistent with the imported lineup without adding
  events that prevent replay of the match.

## 0.20.0 - 2026-11-06

### Added
- Experimental tactical reports gather selected matches of one opposing team
  into an archived, editable preparation report. Match selection starts from
  imported competition/season metadata and allows including other matches.
  A team-vs-team similarity score reuses the Trends engine and displays its
  sample; match, rally and action counts remain visible throughout the report.
- OVS generates a draft with tactical priorities, per-rotation serve targets,
  setting distribution, block/defence and serve cards. Coaches can add optional
  overview, reception and individual attack sheets, duplicate/reorder sheets,
  and edit advice, table cells, titles, notes and sample captions directly.
  Priorities have a coach-defined order and no fixed item count.
- Reception formations highlight serve targets on six P1–P6 courts. Attack
  sheets distinguish attacks after reception and defence, with direction fans,
  ball types, efficiency, clutch situations, tips, block-outs and blocking
  context. Setting courts include both setters when supported by court
  exposure, zone distribution, attack-point shares and predictability.
- Serve sheets show preferred type, start/target zones, errors, aces and
  consecutive serving runs. Reaction-after-break analysis identifies the next
  first-ball attacker and serve choices. Traffic-light thresholds and minimum
  samples are configurable or calculated from the archive; explanations are
  included in the metrics glossary.
- Reception and attack cards share expiring, multi-video YouTube action
  playlists with playable-action coverage and optional QR codes.
- Shared SVG editing provides an icon toolbar, contextual color, number, text,
  size, opacity, thickness and curve controls, direct handles, duplication,
  undo/redo, keyboard shortcuts, zoom and pan. Repeated extra drawing sheets
  support half/full courts, both orientations, players, arrows, cones, target
  areas and text with mouse or touch. Drawing data and report edits travel in
  `.ovs` backups, sync and merge.
- Tactical reports export branded A4 PDFs and editable SVG sheets in a ZIP.
  Export guidance links to Canva, SVG-edit and Inkscape. Shared web snapshots
  preserve their original content and have reader-checked expiry, as with video
  playlists; expiry is not server-enforced access control.
- Play-by-play is available in team Data Study, single-match analysis and
  set/match-end statistics. Two team-name buttons switch the selected team's
  contacts; set and match selectors retain independent chronologies and PDFs.
  The studied team is preselected correctly at home or away.
- Play-by-play uses a continuous stepped score band shared by web and PDF,
  with one tile per point of lead, scores on the winning team's side, serving
  jerseys, BP badges and rotation guides. Switching teams mirrors score order
  and geometry. Timeouts, penalties and corrections stay distinct from rallies;
  missing details are not invented. Long sets retain one scale across vector
  continuation pages, with complete labels available in a text view.
- Team archives use a searchable, sortable table with result counts and a
  second row of always-visible icon-and-text actions per team. New/edit opens
  a separate full-width form; returning preserves search, sort and scroll.
  Team and roster changes are staged until Save, with discard confirmation
  and name synchronization after saving.
- Updated report workflows, drawing widgets, glossary entries and responsive
  tablet/phone layouts in all ten supported languages. Added consistent icons
  for report formats, sheet actions and archive import/export.

### Fixed
- Tactical PDFs share pages efficiently, keep branding in the running header,
  and print priorities in a ranked table with repeating headers. Tables and
  court grids retain complete rows across page breaks; long notes can flow
  across pages. Monochrome cues and low-sample markers remain readable.
- Drawing history records completed drags reliably and restores cancelled
  touch gestures. Pending report edits are flushed on leaving, writes are
  serialized, and failures are surfaced instead of reported as saved.
- PDF fonts cover Arabic/Latin and CJK text without an additional runtime
  library. Tactical PDF text uses browser bidi layout for mixed Arabic/Latin
  word order. Report layouts handle missing video, names or jersey numbers.
- Imported setter attribution includes legitimate second setters without
  attributing middle-blocker substitutions or unrotated lineup columns as
  setting activity. DataVolley lineup imports replace liberos in place
  without shifting court slots.
- Match setup enforces a maximum of two liberos per team.
- DataVolley dates with dotted time values are formatted correctly in team
  match lists.

## 0.19.2 - 2026-11-05

### Added
- Share links for YouTube playlists now have a duration: 1 day, 1 week
  (default), 1 month, 6 months or never. The player shows until when the
  link is valid and stops playing once it has expired. Links shared
  before this version never expire.
- The shared player lists every action under the video, numbered, with a
  short description (skill, player, evaluation). Tap one to go there, or
  use ↻ to repeat it in a loop.
- Android: the app runs full screen. Swipe from the top or bottom edge to
  show the system bars for a few seconds.

### Fixed
- YouTube "error 153" in the desktop and Android app: YouTube videos now
  play through the hosted player page. A shared playlist opened inside
  the app is opened in the browser.
- The shared player's play/pause button and highlighted action follow
  the video, also after pausing or seeking with YouTube's own controls.

## 0.19.1 - 2026-11-04

### Fixed
- Video sync: correcting one action no longer shifts every following
  action. Once the video is synced, "Fix this action only" moves just
  that action; "Sync from here onward" is still there for cuts or pauses
  in the video. Each sync point in the list can be switched between the
  two. Corrections saved before this version are "from here onward":
  switch them to "this action only" if they made later actions drift.

## 0.19.0 - 2026-10-22

### Added
- YouTube video sources: a "?" guide (shown once, can be hidden for good)
  explains that YouTube only streams, so clips cannot be cut, and how to
  download the video and load it as a local file to make clips.
- "HTML player" export for YouTube sources: a standalone page that plays
  the filtered actions back to back from YouTube, with the codes on
  screen and a clickable clip list. The desktop app's "Open player" serves
  it from a local address and opens it in the browser (YouTube refuses to
  play it from a file opened from disk).
- "YouTube playlist" (.txt links) is now also available for a single match.
- "Share link" for YouTube sources: a link to send to athletes that plays
  the filtered actions in sequence from YouTube, on a phone too and
  without OVS. The whole playlist is inside the link (after the #), so
  nothing is stored anywhere; OVS can also open a pasted link from any
  domain ("Received a playlist link? Open it here").
- "Replace with local video" / "Replace with YouTube video" keep the sync,
  and "Shift the whole sync" aligns it with the new video: tap an action
  and mark where it really is, or shift by ±0.1 s / ±1 s.

### Fixed
- The YouTube playlist download did nothing in the desktop app.
- Why "Download filtered video clip" is disabled for YouTube is now shown
  as text, not only as a tooltip.
- The About page shows the license as AGPL-3.0-only.

## 0.18.5 - 2026-10-18

### Added
- Export to Tiebreak Tech (.db) from the match analysis page, next to
  DataVolley and .ovs.
- A set can start with empty positions (e.g. an unknown opponent): tap the
  "+" on the court (or in Tags) and enter the jersey number; the player
  fills that position from the start of the set.
- The opponent's name is optional ("Opponent"); an unnamed opponent is
  never saved in the team archive.
- Tags input redrawn as a court: both teams at their positions, one tap on
  a skill × grade grid, a jersey number grid, optional ball type and
  blockers, and an option to record one team only (with Opponent error /
  Opponent point buttons).
- Live scouting on smartphones: compact header, the court follows the
  phone (vertical upright, horizontal in landscape), Basic and Tags work
  upright; nothing is wider than the screen.
- New logo (app icons, PDF reports), cover image on the home page, new
  favicons and a preview image for shared links.
- The web app also shows the donation invite after an update.

### Changed
- Role-order initials in each language (P-S-C in Italian, S-O-M in
  English, Japanese, Chinese and Arabic, Z-A-M in German…).
- Japanese volleyball wording. Ideas for Tags, smartphones, empty
  positions and the unnamed opponent come from courtendvb's SyncScout Live
  fork.

### Fixed
- The number of blockers chosen on an attack (Detailed input) was lost.
- Touches recorded with buttons no longer export a placeholder zone to
  DataVolley.
- Tiebreak Tech import: family and given names were swapped; serve
  direction, reception zone and action times are now read.
- The libero no longer offers to replace an empty position.

## 0.18.4 - 2026-10-17

### Added
- Basic input, before Tags: a large Serve button (showing the server) and
  one Point button per team, no players or evaluations. With the video
  open, serve and point keep their video position, so a match can be
  watched rally by rally. A serve without a known server is exported to
  DataVolley as player 00.
- Court input shows the ball types for serve (H/M/Q) and attack.
- Picture in picture for the live video (Chrome/Edge web app): an
  always-on-top window that can be resized freely; it resumes where the
  video was, and Space works there too.
- Points recorded with the video open keep their video position in every
  input level: the DataVolley point row marks where the rally ends.

### Changed
- The app menu is hidden during live input; a menu button beside the court
  rotation shows it.
- Ideas for Basic input and the hidden menu come from courtendvb's
  SyncScout Live fork.

### Fixed
- After clicking inside a YouTube video, Space no longer played or paused it.
- The evaluation row was clipped beside a video on a small laptop (0.18.3).

## 0.18.3 - 2026-10-16

### Fixed
- Live video beside the vertical court on a small laptop screen: the
  picture was a thin strip. The playback bar and "Remove video" now share
  one row and the eight skill buttons fit on one row, so the picture is
  about twice as wide and tall.

### Changed
- Italian: "rilevazione" instead of "scoutare" ("Inizia la rilevazione").

## 0.18.2 - 2026-10-14

### Added
- Libero exchanges by drag: the libero beside the court can be dragged
  onto a back-row player to come in for exactly that player (a tap still
  brings them in for the back-row middle).
- New reception preset "P-S-C · P1 special": in P1 the opposite and the
  middle wait at the net in zone 4, the outside hitter in position 2
  receives on the left (receivers S1, S2, libero) and the setter comes in
  from behind the libero.

### Changed
- The "opposite receives" reception presets are gone: in the classic
  schemes the opposite never receives.
- P-C-S defense preset: in P1 side-out the front row keeps its places for
  the whole rally, as in the P-S-C one.

### Fixed
- Right after the receiver was picked, the receiving team was drawn with
  the active system instead of the one assigned to the team, so in P1 the
  outside hitter and the opposite could swap.
- The libero put on court at set start (or just brought in) could not be
  taken out again: an exchange needed a full rally since the previous one.

## 0.18.1 - 2026-10-13

### Added
- Manual corrections between rallies, in "Manage action": point +1 or −1,
  rotate a team forward or back, give the serve. They change score,
  rotation or serve without counting as points in the stats, can be undone
  with Ctrl+Z, and a point that wins the set closes it.

### Changed
- Libero exchanges work as in Click&Scout: the off-court libero and the
  player out for the libero are shown beside their team's half of the court
  and one tap swaps them, with only a short message. Tapping the libero
  during a rally also picks them for the touch. The libero still leaves
  automatically before the front row; there is no confirmation panel for
  entries any more.

### Fixed
- DataVolley export: the lineups never rotated, so DataVolley's rotation
  analyses of an exported match were wrong. Rotations, setter changes and
  scores now match the original files on real matches.
- DataVolley import and export keep setter changes (e.g. after a double
  substitution).
- Libero exchanges are no longer exported as substitutions, and red-card
  points are exported.
- Confirming the new setter after a substitution silently did nothing.

## 0.18.0 - 2026-10-13

### Added
- Reception and defense systems can be assigned to a team in the Systems
  page; during scouting each team uses its own systems, falling back to the
  active ones.
- New systems start from a preset: three receivers with or without the
  opposite receiving (the front-row outside hitter stays out), in P-S-C
  (outside hitter in 2) and P-C-S (middle blocker in 2), plus defense
  presets for both orders. Any system can be duplicated and redrawn freely.
- The set-start wizard proposes the team's own role order (P-S-C or P-C-S)
  when the setter is chosen.
- The reception editor flags positional faults (overlap rule) in each
  rotation; it warns but never blocks.
- Systems can be exported to a configuration file (one system, or all of
  them) and imported again; importing never overwrites local work. The .ovs
  backup now includes the systems.
- The About page has a "Support development" section, and after an update
  the installed app shows once a small notice inviting a donation. The
  donation is optional and unlocks nothing.

### Changed
- The live toolbar lists the match's setter calls (K1, K7, K2…) on sets and
  its attack combinations (X5, V6, C1…) on attacks; picking a combination
  also sets the attack's ball type. Matches scouted in OpenVolleyScout use
  the standard DataVolley tables.
- "Export configuration" in the systems editor saves a file that can be
  imported again, instead of TypeScript code.

### Fixed
- DataVolley files whose opponent is entered by name only (no players) can
  be imported; that team's player and rotation stats stay empty.
- Attacks no longer get the setter call K1 as their combination code, which
  DataVolley does not accept; older matches are exported without it.
- The attack-combination and setter-call tables of imported .dvw files are
  kept and written back on export, instead of being exported empty.
- The base reception system had two positional faults (rotations 4 and 6).
- External links (About page, donation) open in the system browser in the
  desktop app.

## 0.17.5 - 2026-10-12

### Added
- When a block deflection is dragged into the blockers' court, after tapping
  the blocker you can rate the block **+** (good ball for the blockers) or
  **-** (poor ball). The attack follows automatically: B+ → A-, B- → A+.
  Drawing the next trajectory keeps +. The scouting tutorial shows this case
  in four new slides, plus two more for reception / and for an error on a
  dig; its dig slides now show the evaluation proposed from the attack.
- Space pauses and resumes the video in the Video analysis tab too, for
  both video files and YouTube, without clicking the player first. The
  Ctrl+Space shortcut from Settings works there as well, also while editing
  a code.

- Reception **/** (the ball goes straight over the net, or forces a free
  ball) can be picked on the court: it records S/ + R/ and hands the ball to
  the serving team, with no set.

### Changed
- The scouting codes shown during scouting (code panel, rally code lists)
  use the DataVolley layout of the .dvw export, e.g. `*07AQ+X5~48B~2`.
- After an attack rated **-** the opponent's next touch is proposed as a
  dig rated **#** (DataVolley A- ↔ D#), no longer as a freeball.
- **=** on a set, dig, freeball or cover now ends the rally with the point
  to the opponent, as in DataVolley and Click&Scout.

### Fixed
- A B+ block from a dragged deflection no longer disappears when the
  blocking team plays on: its next touch used to replace the block.
- Editing a rally code in the code panel no longer drops the evaluations:
  the old code layout put the evaluation last, where it was not read back.
- Covers are exported to DataVolley as digs: the export wrote an unreadable
  row, since DataVolley has no cover skill.
- The number of blockers (including 4 = hole block) is kept when importing
  and exporting DataVolley files and when editing codes.

## 0.17.4 - 2026-10-12

### Fixed
- DataVolley files that record attacks, blocks or serves by a libero (for
  example files from Click&Scout) can be imported again. These touches are
  still left out of the statistics, and the import now shows a warning for
  each one instead of stopping with an error.

## 0.17.3 - 2026-10-04

### Changed
- Video clip export now copies the original video data instead of
  recording the playback: a montage of dozens of clips takes seconds instead
  of its full running time, keeps the original quality, and no longer needs
  the tab in the foreground. It works the same in the browser (including
  Safari on iPhone and iPad) and in the desktop app. The action codes are
  embedded as subtitles; the desktop app also saves them as a `.srt` file
  next to the video. Files the new method can't read still fall back to the
  previous export.
- On phones the video area is removed, and Tags input shows the video only
  when it fits beside the pad (at least 1100×600). A notice explains why the
  video is missing and that OVS works best on a computer or tablet.
- Ctrl+Space pauses and resumes the video everywhere, also while typing
  DataVolley codes. The combination can be changed in Settings.

### Fixed
- Space no longer starts a video hidden in the collapsed floating panel.
- Space presses the focused Yes/No button of the point confirmation instead
  of toggling the video.
- Switching between Tags and Court input resumes the video where it was.
- The About screen showed the previous version number.

## 0.17.2 - 2026-10-03

### Installing on Apple devices
- **macOS**: the desktop builds are **not signed or notarized by Apple**
  (this is a free-software project without an Apple Developer account), so
  macOS warns that the app "cannot be opened" or "is damaged". Using them is
  at your own discretion. If you trust the download from this release page,
  open it once with right-click → **Open**, or allow it in **System Settings
  → Privacy & Security → Open Anyway**, or remove the quarantine flag from a
  terminal: `xattr -dr com.apple.quarantine /Applications/OpenVolleyScout.app`.
  Automatic updates keep working after that.
- **iPhone / iPad**: there is no App Store or signed iOS app. Use the web
  version instead: open https://napo.github.io/openvolleyscout in Safari and
  choose **Share → Add to Home Screen**. It then starts like an app and works
  offline.

### Changed
- Vertical court on a desktop: the entered codes stay on the left, the court
  in the middle, and the video on the right with the scouting controls below
  it. Instructions sit above the court, so they no longer cover the server or
  the service area.
- Without a video, the video tile shows a "No video" illustration next to the
  source buttons.
- On smaller screens the video is an optional floating window, closed at
  start and opened with its own toggle.
- Space pauses and resumes the video during live scouting, even with focus
  on a scouting button. It still types a space in text fields.
- Non-default languages are loaded on demand, so the app starts faster.
- Live scouting no longer rebuilds the match statistics on every touch, and
  the analysis views compute each saved match's stats only once.

### Fixed
- Japanese and Chinese text printed blank in exported PDFs.

### Known issue
- The About screen of the desktop builds shows 0.17.1; the installed version
  is 0.17.2. Fixed in the next release.

## 0.17.1 - 2026-09-29

### Installing on Apple devices
- **macOS**: the desktop builds are **not signed or notarized by Apple**
  (this is a free-software project without an Apple Developer account), so
  macOS warns that the app "cannot be opened" or "is damaged". Using them is
  at your own discretion. If you trust the download from this release page,
  open it once with right-click → **Open**, or allow it in **System Settings
  → Privacy & Security → Open Anyway**, or remove the quarantine flag from a
  terminal: `xattr -dr com.apple.quarantine /Applications/OpenVolleyScout.app`.
  Automatic updates keep working after that.
- **iPhone / iPad**: there is no App Store or signed iOS app. Use the web
  version instead: open https://napo.github.io/openvolleyscout in Safari and
  choose **Share → Add to Home Screen**. It then starts like an app and works
  offline.

### Changed
- Every DataVolley export now follows the match's Video analysis sync points
  whenever it has any, so the `.dvw` always lines up with the synchronized
  video - the regular "Export DataVolley" button included.
- The "Export DVW with synchronized video times" button moved from the
  Analysis page header into the Video analysis synchronization section. It
  is available as soon as a sync point exists (the section says so while it
  is disabled). Its separate options (first-serve position, YouTube start
  link, time shift) are gone: synchronization is done with the sync points.

## 0.17.0 - 2026-09-28

Scouting for match day on tablets: jersey-first rosters, three input levels
(Court / Detailed / Tags), an installable offline web app, and vector PDFs.
Several of these features were adapted from the SyncScout Live fork by
courtendvb - thanks for the contribution.

### Installing on Apple devices
- **macOS**: the desktop builds are **not signed or notarized by Apple**
  (this is a free-software project without an Apple Developer account), so
  macOS warns that the app "cannot be opened" or "is damaged". Using them is
  at your own discretion. If you trust the download from this release page,
  open it once with right-click → **Open**, or allow it in **System Settings
  → Privacy & Security → Open Anyway**, or remove the quarantine flag from a
  terminal: `xattr -dr com.apple.quarantine /Applications/OpenVolleyScout.app`.
  Automatic updates keep working after that.
- **iPhone / iPad**: there is no App Store or signed iOS app. Use the web
  version instead: open https://napo.github.io/openvolleyscout in Safari and
  choose **Share → Add to Home Screen**. It then starts like an app and works
  offline.

### Added
- Video analysis: several sync points (key points) are easier to use. A new
  "Add sync point" button works on the action just played or clicked, a hint
  explains that points already saved never move, and the points are listed
  in match order. Between two points the correction can be a jump (for a
  recording with pauses) or gradual (for a video that drifts slowly).
- The DataVolley export aligned to the video can use the Video analysis sync
  points, so each action in the DVW gets exactly the video time shown in the
  video list.
- Three input levels in live scouting, switchable at any time from the
  header: **Court** (large touch buttons, draw zones and ball directions),
  **Detailed** (the original full DataVolley input) and **Tags** (buttons
  only: team, player, skill, evaluation; the next team/skill is guessed from
  the rally, and the video docks beside the pad). Tags go through the code
  input path, so stats and export are unchanged, but zones and directions are
  not recorded. The first time live scouting opens, the scout picks a level;
  Court is suggested on touch-only devices, Detailed on devices with a mouse.
- Touch-friendly live input: a large six-button evaluation bar with
  skill-specific labels (ordered worst to best, `= / - ! + #`, in Court and
  Tags), a point confirmation that says who scores and why, larger header
  controls (+1, undo, TO / Subs for each team) and a fixed toolbar height.
  The Detailed input keeps the DataVolley order and labels.
- Confirmation feedback: the screen edge flashes when a play or point is
  recorded, with an optional tone (Settings).
- DataVolley export aligned to a match video: a new button on the Analysis
  page shifts all DVW video times so the first serve lands at a given video
  position (typed as 12:34 or taken from a YouTube link with ?t=), with an
  extra fine-tuning shift. The DVW export now also keeps the video position
  recorded with each touch when the match was scouted with the video panel.
- The web version is an installable offline app (PWA): it can be added to
  the home screen of tablets and phones and starts without network. A new
  version waits for "Update now" instead of reloading during a rally. Desktop
  builds are unchanged.
- Backup reminder on the Data page and at match end, with the days since the
  last full backup.
- Japanese UI language (English stays the default).
- Jersey-first rosters: players can be scouted by number and named later.
  A quick-entry field ("1-12 L13": ranges, L marks a libero) is available on
  the Teams page, in match setup, at set start (new numbers fill the empty
  court positions) and in the substitution dialog (the new player is
  preselected as player in). Players added during a match also join the
  team archive, and names typed later on the Teams page are copied into the
  saved matches without changing player ids. Unnamed players show as "#12"
  and export to DataVolley with their jersey number and an empty name.
- A match being scouted reopens automatically after the page is reloaded
  (mobile browsers such as iPad Safari reload or discard background tabs),
  landing back on the same scouting screen with score, rotation and
  events intact. Finished matches are not reopened, and "New match" clears
  it.
- Live undo survives the reload: the last actions can still be undone after
  the match reopens. Each saved undo entry is checked against the stored
  event log, so an action whose events had not been saved yet is dropped
  instead of undoing the wrong events.

### Changed
- Widget PDF exports (e.g. the team radar) are now vector: charts are drawn
  as SVG, labels and tables as real text, instead of a screenshot. Files are
  much smaller (the radar went from ~900 KB to ~60 KB), sharp at any zoom and
  searchable. The OVS logo in every PDF, match report included, is now the
  vector logo instead of a 400 KB PNG.
- Match setup: competition and venue are optional (an empty competition is
  saved as "Practice match"), the setter may be left unselected (the player
  in the S role is used), and picking a saved team preselects its roster (at
  most two liberos).
- Analysis pages, charts and settings load on demand, so the scouting screens
  start faster (main bundle about 1.5 MB instead of 2.6 MB).
- Display and input preferences (toolbar size, confirmations, input level…)
  are kept across reloads.
- Player first and last names are no longer required (Teams page, match
  setup). The official roster size rules (at most 14, at least 6 players)
  become warnings and an empty roster no longer blocks scouting, since
  casual matches often start with partial rosters that grow during play.
  The libero-count and captain rules still apply.
- Match dates are shown in the operating system's regional format
  (27/09/2026, 09/27/2026, 2026/09/27…) everywhere: match lists, team
  analysis, trend charts, the video panel, the live scouting header and the
  match report. The live header used the app's UI language and the lists a
  fixed YYYY-MM-DD, so the same match could read differently on two screens.
  Matches imported without a time no longer show a made-up "01:00"/"02:00".

### Fixed
- Video analysis: loading the same YouTube video again (or the same file by
  path) no longer deletes its sync points.
- The printable/PNG match report is translated (its labels were fixed
  English/Italian), and it counts only finished sets as won (an open set no
  longer counts for the team leading it).
- Names typed on the Teams page reach saved matches automatically, and new
  teams are linked to their match roster by id instead of by name.
- Match dates are now read in the device's local time zone instead of UTC.
  Creating a match shortly after midnight (00:00–01:00 in Italy, 00:00–02:00
  in summer) saved it with the previous day, because the default date came
  from UTC while the start time was local. Match lists, team analysis, trend
  charts, the video panel and the match setup form showed the wrong day for
  the same reason, and the DataVolley export header could shift the date and
  time of a match by the zone offset. Date-only match times (DataVolley files
  without a time, Tiebreak imports) keep their day in every time zone. Backup
  file names and the YouTube playlist header also use the local date.

## 0.16.1 - 2026-09-15

### Fixed
- Side-out study: a reception-phase attack with no recorded "set" touch was
  always attributed to a direct second-touch attack by the setter, zeroing
  out the whole zone-distribution breakdown. Many real DataVolley scout
  files (Click&Scout exports included) never log the set as its own row at
  all - the set is meant to be inferred. The classification now only
  treats it as a setter's own attack when the second-touch player is
  actually a roster-flagged setter; otherwise it falls back to zone
  classification (an implicit, unlogged set), attributing the "who set it"
  role to the team's real setter instead of the attacker.

## 0.16.0 - 2026-09-15

### Added
- Video analysis: actions of interest can now be marked with a star,
  independently of the current filters, and exported as their own set of
  video clips (separate from the existing filtered-clip export). Available
  in both the single-match video panel and the multi-match video panel.
- Analytics: a first PDF export button for individual charts/widgets (starting
  with the team radar chart), rasterizing the widget and composing it into a
  branded PDF (logo, generated timestamp, "a project by" footer) alongside
  the existing match-report PDF export.

### Changed
- Video analysis and match-report PDF branding (fonts, logo, colors) now
  share a single module instead of being duplicated.

## 0.15.1 - 2026-09-08

### Fixed
- Live scouting: the central SETS/POINTS scoreboard always rendered the
  home team's score first and the away team's second, regardless of which
  side each team was actually displayed on. Whenever the home team was set
  to display on the right (or after the mid-set court swap), the digit
  that incremented sat on the opposite side from the team that had
  actually scored, reading as a wrong-team point award even though the
  underlying score and next server were always correct. The readout now
  follows the same left/right display logic already used by the point
  buttons and team panels.

## 0.15.0 - 2026-09-08

### Added
- Quick-scout live flow: attack input is now player-first - the attacker is
  tapped before drawing the trajectory (matching Click&Scout §4.4.3), with
  the ball moving onto the selected attacker, a repeatable tap in their own
  court to redefine the start point, and a tap/drag into the opponent's
  court or the net to commit the attack. The attack ball type (H/Q) is also
  suggested from the preceding reception's quality, deferring to any manual
  pick the scout makes. Dig/set input stays trajectory-first.

### Fixed
- Live scouting: the keyboard point-award shortcuts (`<`/`>`) and the
  manual point buttons could award a point to the wrong team after a
  mid-set change of court ends (e.g. the deciding-set 8-point switch,
  toggled with the "⇄" button) - the swap state was plain component state
  that silently reset whenever the scouting page remounted (navigating away
  and back, or an app reload), desyncing which physical side each team was
  actually on. It's now persisted per match/set so it survives a remount.
- Quick-scout live flow: the ball token sat above player markers in
  z-order, so a tap on a marker directly under the ball (routinely, since
  that's exactly where the last touch happened) was silently swallowed
  instead of selecting the player.
- Expert mode: code-input and match-code-edit fields no longer auto-focus
  on touch devices (iPad, Android tablets, Windows tablet-mode), preventing
  the on-screen virtual keyboard from popping up unwanted.

## 0.14.3 - 2026-08-03

### Fixed
- macOS release builds: ad-hoc sign the `.app` bundle in CI before it's
  wrapped into the `.dmg`, so Gatekeeper reports the bypassable
  "unidentified developer" warning instead of "is damaged and can't be
  opened" on downloads carrying the browser quarantine flag.

## 0.14.2 - 2026-08-03

### Added
- Side-out study: a "By call" view groups the setter distribution by attack
  combination / setter call code (falling back between the two, matching
  DataVolley's own "Distribuzione su basi" report) instead of only by court
  zone - one court per distinct call, with a rotation filter and an empty
  state when the match has no call codes recorded.

### Changed
- Vertical court live scouting: the manual code-entry panel now docks as a
  collapsible right-side rail (closed by default) instead of sitting open
  below the court, freeing height back to the court, which always keeps
  priority for space.
- Vertical court live scouting: the toolbar (skill/evaluation/ball-type
  controls) now matches the court's actual rendered width - its landscape-
  oriented 5-column layout used to collapse the skill selector to 0 width on
  narrow portrait courts, producing a broken one-button-per-row column; it
  now stacks as compact full-width wrapping rows sized to the court.

### Fixed
- Attack/serve heatmap: out-of-bounds errors (evaluation `=`) landing past
  the court are now drawn extended past the boundary for serves too, not
  only attacks (the two-panel arrows view already did this for attacks as
  of 0.14.0).

## 0.14.0 - 2026-08-01

### Changed
- Block-touch recording during live scouting: removed the mid-drag "pause at
  the net" timing gesture (180ms dwell) - timing-based detection was
  unreliable across devices/hand speed. The single remaining mechanism is
  the two-drag flow (drag to the net's block area, then a second drag to the
  deflection's landing point), matching Click&Scout's own design. The net's
  "block area" band is now wider (5% of court width, up from 2%) so the
  release is easier to land
- Team situation analytics: removed the "Transizione CP"/"Transizione BP"
  tiles - the underlying `transition_attack` rally phase could never
  actually be produced by the classifier once the exchange-count fallback
  was added (every rally with a winning attack resolves to
  `attack_after_receive` or `attack_after_dig` first), so the tiles always
  read empty. "CP length"/"BP length" (average exchanges per rally) already
  cover the same "how long do rallies run" question

### Fixed
- Attack heatmap: attacks landing out of bounds (evaluation `=`) were
  folded into the nearest in-court zone instead of reading as out - the
  two-panel arrows view now draws the landing point past the court
  boundary, extended along the attack's own trajectory; the single-court
  view excludes them from the grid and shows a "+N errors" note instead of
  silently dropping them. Court boundary, 3m line and net markings on the
  single-court view are also visible again (they were drawn in white,
  invisible against the view's now-white background)

## 0.13.1 - 2026-07-31

### Fixed
- Match report team totals row: reception Pos%, attack K%/Eff%, and serve
  Pos%/Eff% were computed from a denominator that was silently doubled (a
  `reduce` accumulator was seeded with the already-summed total instead of
  0, then summed again on top of it). Raw counts and Prf% were unaffected,
  but the halved rates could read lower than Prf% - impossible under the
  real formula - and disagreed with the independent set-summary table
  showing the correct value
- Side-out study rotation cards: the count shown next to "Alzatore (2°
  tocco)" / "Alzata senza attacco" was the attack-filter-narrowed count
  instead of the bucket total, invisible with all attack-result filters on
  but inconsistent with the percentage once they're narrowed

## 0.13.0 - 2026-07-30

### Added
- "Sperimentazioni" (Experimental features) section in Settings, gating the
  five Trends sub-tabs (Priorities, Similarity, Season trend, Competition
  comparison, Rally model) as individual, off-by-default toggles. The Trends
  tab itself only appears once at least one is enabled
- The live video panel now docks flush beside the court, sharing the row's
  width, whenever the court is in vertical orientation and the panel is
  open - instead of floating over the court and leaving dead space around
  the narrower vertical court. Closing the panel (or leaving vertical
  orientation) gives the court back its full width
- On a smartphone (landscape, ~560px tall or less), the code-list,
  opponent-attack, and code-input panels now default closed and expand to
  the full screen instead of squeezing the court when opened; the video
  panel isn't shown at all on smartphone, since live-only scouting from a
  phone doesn't use it
- Auto-update now asks for confirmation before downloading/installing a new
  version, instead of downloading it silently in the background
- Settings → Debug → "Repair touch ID collisions": scans locally stored
  matches for the touch-ID bug below and reassigns unique IDs where needed

### Fixed
- Touch IDs were minted from `Date.now()` alone (millisecond resolution).
  Two touches recorded in the same millisecond - routine when one is
  inferred immediately from another, e.g. a serve inferred from a
  reception - silently collided, and one was dropped from every derived
  stat. Most visibly, the side-out study could show zero or an incomplete
  rotation distribution for a team. IDs are now generated with
  `crypto.randomUUID()`

## 0.12.0 - 2026-07-24

### Added
- New "Priorities" sub-tab in Trends: diagnoses a team's technical
  indicators (serve, reception, MTRP, attack, FBSO, AST, block points/set)
  and tactical-rotation efficiency, and a player's technical indicators,
  against a benchmark built from that team's/player's own wins within the
  selected match window. Shown as radar charts (team/player technical),
  bar charts (rotations), trend arrows, and a per-category drill-down
  showing the evaluation mix over time as a stacked bar chart
- Match report PDF export rebuilt on pdfmake (replacing
  html2canvas-pro/jsPDF), producing native vector PDF pages instead of a
  rasterized canvas screenshot

### Changed
- Rally/exchange counting (side-out length, break-point length, FBSO/AST
  and transition-attack classification) now infers an exchange from which
  team last touched the ball, instead of requiring an explicit dig or
  freeball touch - those aren't always recorded by the scout, and the
  previous logic under-counted exchanges whenever one was skipped
- Ball-direction heatmap arrows are now colored by touch evaluation, using
  the same color scale as the Priorities evaluation-mix chart, instead of
  by skill, and scaled in thickness by touch count, with a legend

### Removed
- The "ball-handling errors per set" indicator: not a reliable signal
  under the current double-contact rules

### Fixed
- The release pipeline's asset-cleanup step deleted the lowercase
  installer files that the auto-updater manifest (`latest.json`) actually
  points to, right after renaming copies of them to a friendlier
  `OpenVolleyScout-*` filename - silently breaking in-app auto-update on
  Windows and Linux since v0.11.0 (macOS was unaffected). Both filenames
  are now kept

## 0.11.0 - 2026-07-21

### Added
- Metrics glossary: NCAA-analytics-style FBSO (First Ball Side-Out), AST
  (Attack after Service Turn), and MTRP (Make Them Play) percentages, plus a
  CP/BP (side-out/break-point) rally-length distribution, added to the match
  report and the game-situation dashboard. A new "Metrics glossary" page
  (linked from About and from the dashboard) explains every acronym on hover
- FBSO/AST/MTRP added as selectable axes on both the team and player radar
  charts, alongside the existing side-out/break-point axes
- The per-athlete ball-direction heatmap gained an "Attack after" filter to
  separate attacks that follow a reception (first ball) from attacks that
  follow a dig (transition), on top of the existing evaluation filter
- New "Trends" tab, replacing the standalone "Similarity" tab on both the
  match Analysis page and the Team study page, grouping four related,
  longer-horizon views: Similarity (unchanged), Season trend (a team's
  indicator timeline across its matches, with a latest-vs-average delta
  table), Competition comparison (how a team ranks against others in the
  same competition), and Rally model (Markov-chain absorption
  probabilities - the odds a rally ends in a point, estimated per game
  situation from historical touch sequences, with side-out and break-point
  computed as two independent chains)
- Team/competition name fields in match setup now show the full saved list
  as a browsable dropdown when the field is empty, instead of only
  reacting once you start typing

### Fixed
- The Tiebreak Tech (.db) importer had several serious correctness bugs
  affecting every imported match: point-winner attribution was effectively
  random (a database field it relied on is not reliably populated), every
  touch evaluation grade was inverted, jump-float/jump-serve service types
  were swapped, and rule-violation rows (net faults, four touches,
  back-row-attack faults) were silently dropped instead of being recorded.
  Verified by reconciling an imported match against its known-correct
  DataVolley export action-by-action

## 0.10.0 - 2026-07-21

### Added
- Vertical (portrait) court orientation for live scouting: a Settings toggle
  plus a rotate button in the live score bar switch the court between
  landscape and portrait; a swap button next to it lets you invert which
  team is displayed on which side at any point during a live rally
- On phones, enabling vertical mode now lets the court actually use a tall
  portrait screen - the forced-landscape rotation prompt no longer applies
  while vertical mode is on, and the side panels (DVW code list, code entry,
  opponent-attack analysis) collapse automatically to give the court more
  room
- The score/team-name bar moves to a compact column alongside the court in
  vertical mode, with the rotate/swap buttons next to the score and long
  team names wrapping across two lines instead of being cut off

### Fixed
- The rotation used for the vertical court was a mirror flip rather than a
  true turn, which could scramble left/right zone numbering (e.g. zone 4
  landing where zone 2 belongs); it's now a proper rotation
- Data page → "Continue setup" always reopened the team/roster setup wizard
  even when a set was already in progress; it now goes straight to live
  scouting in that case, since the roster is obviously already configured

## 0.9.6 - 2026-07-20

### Added
- Settings → Debug: "Don't show file-import warning and info messages" toggle.
  When off (default), a successful DataVolley import that produced
  non-blocking warnings now shows the full warning list with a Continue
  button instead of collapsing it into just a count; when on, only the
  plain success message is shown. Blocking errors always stop the import
  and show their details regardless of this setting

### Fixed
- Scouting toolbar size (Settings → toolbar size slider) had no effect in
  the smartphone-landscape layouts actually used while scouting on a phone
  or tablet - the scale was only wired into the default layout's CSS; it
  now applies in every landscape breakpoint too

## 0.9.5 - 2026-07-19

### Added
- Live video-driven scouting: watch a video (local file, YouTube, webcam,
  or RTSP camera) in a floating draggable/resizable panel while scouting
  live, separate from the existing post-match video analysis; touches
  record their video position automatically, undo seeks the video back to
  match, and desktop builds can pop the panel out into a second window;
  playback position resumes across sessions
- Radar comparison charts: team (home vs. away) and player (vs. their own
  team as a baseline, with optional teammate overlays) radar charts across
  8 selectable performance axes, added to the Team and Player Performance
  dashboards
- Cross-database Similarity: a new "Similarity" tab, available from both
  match analysis and team study, comparing every team and player across
  the whole local database and surfacing "X looks like Y" matches
- Romanian (ro) locale - full UI translation, selectable from Settings

## 0.9.4 - 2026-07-18

### Changed
- Starting lineup setup: selecting a player as setter now automatically
  fills in the rest of that row's tactical roles in rotation order
  (P, S1, C2, O, S2, C1) starting from the setter's position; manually
  changing any other role afterwards no longer reshuffles the rest
- Starting lineup setup: the "Tactical role" column is now labeled just
  "Role"

### Fixed
- Starting lineup setup: liberos could be placed in one of the six
  starting positions, which then made them vanish from the libero
  picker(s) below; liberos are no longer selectable for the starting six
  at all - they're assigned only through the dedicated libero pickers
- Starting lineup setup: the "Back" button had no effect on the very
  first set of a match, since there was no previous wizard step to
  return to; it now returns to the pre-match configuration screen in
  that case

## 0.9.3 - 2026-07-17

### Fixed
- Auto-update: 0.9.2 enabled the macOS `.app` update bundle, but the
  Windows build's release-cleanup step deleted it right after upload
  (it only knew to protect `.sig`/`latest.json`, not `.tar.gz`) - macOS
  auto-update was still broken in practice even though `latest.json`
  pointed to it. Both cleanup scripts now agree on what to keep

## 0.9.2 - 2026-07-17

### Added
- Backup export/sync: export the whole local database - every match plus
  archived teams, rosters and competitions - to a single portable `.ovs`
  file, with the option to select only some matches. Re-importing merges
  each match the same way single-match sync already does: matches that
  merge cleanly are applied right away, while any that need a manual choice
  are flagged so you can resolve them one at a time without holding up the
  rest of the backup
- Load Data: matches can be selected individually (or all at once) before
  exporting a backup, with an option to include or skip archived data

### Fixed
- Auto-update: macOS builds were still missing their signed update package
  because the required `.app` bundle target wasn't enabled - Windows and
  Linux started auto-updating in 0.9.0, macOS was not yet included

## 0.9.0 - 2026-07-17

### Added
- Match export/sync: export a match to a portable `.ovs` file to carry it to
  another computer, then re-import it later with automatic 3-way merging of
  the edits made on both devices in the meantime - only genuine conflicts
  (e.g. both devices scouted further in the same set) are surfaced for you
  to resolve, everything else merges on its own
- Import match: the file picker now accepts DataVolley `.dvw`, Tiebreak Tech
  `.db`, and `.ovs` files in one place - the right import is chosen
  automatically based on the file you pick

### Fixed
- Auto-update: past releases were missing the signed update manifest
  required for the in-app updater to detect new versions, so update checks
  never found anything; this release is the first published with it working
- Release pipeline: parallel platform builds could occasionally race each
  other and fail to publish one platform's installer (this affected the
  macOS Apple Silicon build in 0.8.0)

## 0.8.0 - 2026-07-04

### Added
- Video analysis: filters for skill, player, set number, and setter position
  now accept multiple selections at once (e.g. compare two players' attacks
  together) instead of one value at a time
- Video analysis: the filtered action list can be sorted by time, skill,
  evaluation, player, set, or team, not just chronological order
- Performance Dashboard and Zone Density heatmap: phase filter narrowed to
  three touch-level buckets - Break point, Point, Transition - classifying
  each touch individually instead of filtering whole rallies by a coarser,
  eight-option classification
- Player filter (autocomplete) in the Performance Dashboard now opens a
  browse list grouped by home/away team when focused with no search text,
  so a player can be picked without typing a name

### Changed
- Zone Density heatmap: touches now plot at their real position inside a
  subzone instead of collapsing onto the subzone's center, giving a more
  organic, precise scatter (falls back to a consistent per-touch position
  when no exact location was recorded)
- Zone Density heatmap redesigned: serve origin is now drawn outside the
  court behind the server's baseline with per-lane serve counts, the court
  face is flat white with a real 3-meter line and net marker, and the
  subzone grid/zone-number overlay only shows when subzone labels are
  enabled in settings
- Situation widgets (team/player break-point vs. side-out breakdown) no
  longer apply the shared phase filter, since its meaning changed from
  whole-rally to per-touch and would otherwise double up with the widget's
  own classification

## 0.7.2 - 2026-07-04

### Added
- Spanish (es) locale - full UI translation, selectable from Settings
- "Getting started" tutorial: a second guided slide-show (teams, new match,
  scoring rules, readiness check, starting lineup and serving team) reusing
  the real setup screens with sample data, alongside the existing live
  scouting tutorial

## 0.7.0 - 2026-07-04

### Added
- Cross Rotation Analysis tab in Statistiche gara: break-point and side-out win
  rates for every serving-rotation vs. receiving-rotation combination, shown
  from both teams' perspectives with hover/pin tooltips (record, service
  errors, reception errors, point differential)

### Changed
- Removed the Quick/Simple/Advanced/Expert scouting-mode distinction - a
  single unified live scouting flow replaces all four (schema version bumped
  to 4)
- Quick scouting flow realigned with the tutorial slide-show as the canonical
  spec: evaluation locks once a player is tapped, dig/set actions are
  inferred on redraw, a set inherits its ball type from the attack that
  follows it, setter selection shows colored rings and excludes the
  receiver, redrawing the ball confirms the attack, and the blocker is
  resolved directly (no separate block evaluation step)
- Declining a point confirmation now reverts quick mode to the exact
  pre-selection state
- Reception system: fixed an MB1/MB2 zone swap in rotation 3

### Fixed
- Quick-flow reset effect no longer re-fires on every render, which had been
  wiping the reception selection before the scout could act
- Dragging a serve far out of bounds no longer gets silently swallowed by
  zone-snapping to the serve-start marker
- DataVolley export: served touches now get the correct start-zone code
  instead of an empty/stale/impossible one carried over from the previous
  attack

## 0.6.0 - 2026-07-02

### Added
- Arabic (ar) locale - full UI translation, selectable from Settings
- Point confirmation now asks Yes/No; declining offers "Change evaluation"
  (reopens the exact same decision) or "Cancel" (resets to a neutral state),
  in both quick and standard scouting modes
- Quick mode: block deflection can be drawn as a second segment from the net
  contact point to where the ball lands, matching Click&Scout's block area -
  automatically resolves block-out (A#/B=) and covered (A!/B!) outcomes
- Quick mode: attack drawn out of bounds past the net now auto-records as an
  error and ends the rally, matching Click&Scout behavior
- Compound codes reference table (Receive→Serve, Block→Attack, Attack→Dig) in
  Settings, generated from the same tables the scouting engine uses
- Live scouting tutorial slide-show on the About page, replaying a real
  DataVolley rally inside the actual scouting court and toolbar
- People-at-block now goes up to 4 (hole block), default 2, with a visible
  toolbar label

### Changed
- Block touch inherits the ball type of the attack it touched
- Quick mode proposes cover/freeball/dig for the first team touch based on
  the previous touch's context, instead of always defaulting to dig
- Dig default evaluation now follows the DataVolley attack↔dig compound table

### Removed
- "Live scouting help" section from Settings (superseded by the tutorial
  slide-show); the guide entry point on the About page is unaffected

## 0.5.0 - 2026-06-30

### Changed
- Quick scouting mode rewritten around a DataVolley-compatible 3-touch cycle
  (reception/dig → set → attack), with colored selection rings per touch type
  and skill-aware prompts
- Reception "=" now auto-commits as reception error and ends the rally
- Point confirmation now requested for all rally-ending actions in quick mode
  (attack kill/error, block kill/error, ace, reception error, serve error),
  matching standard/advanced mode behavior

### Added
- New setting: "Require point confirmation" (Settings → Scouting) - when
  enabled, asks for confirmation before assigning a point via the court
  (graphical input); manual code entry always confirms regardless of this
  setting
- Marker size slider in Settings
- Setter position tracking on touches
- Tooltips for evaluation and combination code buttons in the live toolbar

### Fixed
- Side-out distribution calculation per rotation
- v0.4.0 release was broken (missing file caused CI build failure on all
  platforms - no binaries were ever published for that tag); 0.5.0
  supersedes it
- Tiebreak Tech import: `import.meta.env` usage in the parser was silently
  breaking the local test suite under ts-node, causing 8 test files to never
  run; fixed and all tests now pass

## 0.3.0 - 2026-06-27

### Fixed
- Match report calculation and display fixes

### Added
- Tiebreak Tech (.db) database import support
- In-app auto-update: desktop builds check for new versions on startup and show an update dialog with download and install options
