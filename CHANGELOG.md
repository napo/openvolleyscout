# Changelog

## 0.10.0 — 2026-07-21

### Added
- Vertical (portrait) court orientation for live scouting: a Settings toggle
  plus a rotate button in the live score bar switch the court between
  landscape and portrait; a swap button next to it lets you invert which
  team is displayed on which side at any point during a live rally
- On phones, enabling vertical mode now lets the court actually use a tall
  portrait screen — the forced-landscape rotation prompt no longer applies
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

## 0.9.6 — 2026-07-20

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
  or tablet — the scale was only wired into the default layout's CSS; it
  now applies in every landscape breakpoint too

## 0.9.5 — 2026-07-19

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
- Romanian (ro) locale — full UI translation, selectable from Settings

## 0.9.4 — 2026-07-18

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
  at all — they're assigned only through the dedicated libero pickers
- Starting lineup setup: the "Back" button had no effect on the very
  first set of a match, since there was no previous wizard step to
  return to; it now returns to the pre-match configuration screen in
  that case

## 0.9.3 — 2026-07-17

### Fixed
- Auto-update: 0.9.2 enabled the macOS `.app` update bundle, but the
  Windows build's release-cleanup step deleted it right after upload
  (it only knew to protect `.sig`/`latest.json`, not `.tar.gz`) — macOS
  auto-update was still broken in practice even though `latest.json`
  pointed to it. Both cleanup scripts now agree on what to keep

## 0.9.2 — 2026-07-17

### Added
- Backup export/sync: export the whole local database — every match plus
  archived teams, rosters and competitions — to a single portable `.ovs`
  file, with the option to select only some matches. Re-importing merges
  each match the same way single-match sync already does: matches that
  merge cleanly are applied right away, while any that need a manual choice
  are flagged so you can resolve them one at a time without holding up the
  rest of the backup
- Load Data: matches can be selected individually (or all at once) before
  exporting a backup, with an option to include or skip archived data

### Fixed
- Auto-update: macOS builds were still missing their signed update package
  because the required `.app` bundle target wasn't enabled — Windows and
  Linux started auto-updating in 0.9.0, macOS was not yet included

## 0.9.0 — 2026-07-17

### Added
- Match export/sync: export a match to a portable `.ovs` file to carry it to
  another computer, then re-import it later with automatic 3-way merging of
  the edits made on both devices in the meantime — only genuine conflicts
  (e.g. both devices scouted further in the same set) are surfaced for you
  to resolve, everything else merges on its own
- Import match: the file picker now accepts DataVolley `.dvw`, Tiebreak Tech
  `.db`, and `.ovs` files in one place — the right import is chosen
  automatically based on the file you pick

### Fixed
- Auto-update: past releases were missing the signed update manifest
  required for the in-app updater to detect new versions, so update checks
  never found anything; this release is the first published with it working
- Release pipeline: parallel platform builds could occasionally race each
  other and fail to publish one platform's installer (this affected the
  macOS Apple Silicon build in 0.8.0)

## 0.8.0 — 2026-07-04

### Added
- Video analysis: filters for skill, player, set number, and setter position
  now accept multiple selections at once (e.g. compare two players' attacks
  together) instead of one value at a time
- Video analysis: the filtered action list can be sorted by time, skill,
  evaluation, player, set, or team, not just chronological order
- Performance Dashboard and Zone Density heatmap: phase filter narrowed to
  three touch-level buckets — Break point, Point, Transition — classifying
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

## 0.7.2 — 2026-07-04

### Added
- Spanish (es) locale — full UI translation, selectable from Settings
- "Getting started" tutorial: a second guided slide-show (teams, new match,
  scoring rules, readiness check, starting lineup and serving team) reusing
  the real setup screens with sample data, alongside the existing live
  scouting tutorial

## 0.7.0 — 2026-07-04

### Added
- Cross Rotation Analysis tab in Statistiche gara: break-point and side-out win
  rates for every serving-rotation vs. receiving-rotation combination, shown
  from both teams' perspectives with hover/pin tooltips (record, service
  errors, reception errors, point differential)

### Changed
- Removed the Quick/Simple/Advanced/Expert scouting-mode distinction — a
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

## 0.6.0 — 2026-07-02

### Added
- Arabic (ar) locale — full UI translation, selectable from Settings
- Point confirmation now asks Yes/No; declining offers "Change evaluation"
  (reopens the exact same decision) or "Cancel" (resets to a neutral state),
  in both quick and standard scouting modes
- Quick mode: block deflection can be drawn as a second segment from the net
  contact point to where the ball lands, matching Click&Scout's block area —
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

## 0.5.0 — 2026-06-30

### Changed
- Quick scouting mode rewritten around a DataVolley-compatible 3-touch cycle
  (reception/dig → set → attack), with colored selection rings per touch type
  and skill-aware prompts
- Reception "=" now auto-commits as reception error and ends the rally
- Point confirmation now requested for all rally-ending actions in quick mode
  (attack kill/error, block kill/error, ace, reception error, serve error),
  matching standard/advanced mode behavior

### Added
- New setting: "Require point confirmation" (Settings → Scouting) — when
  enabled, asks for confirmation before assigning a point via the court
  (graphical input); manual code entry always confirms regardless of this
  setting
- Marker size slider in Settings
- Setter position tracking on touches
- Tooltips for evaluation and combination code buttons in the live toolbar

### Fixed
- Side-out distribution calculation per rotation
- v0.4.0 release was broken (missing file caused CI build failure on all
  platforms — no binaries were ever published for that tag); 0.5.0
  supersedes it
- Tiebreak Tech import: `import.meta.env` usage in the parser was silently
  breaking the local test suite under ts-node, causing 8 test files to never
  run; fixed and all tests now pass

## 0.3.0 — 2026-06-27

### Fixed
- Match report calculation and display fixes

### Added
- Tiebreak Tech (.db) database import support
- In-app auto-update: desktop builds check for new versions on startup and show an update dialog with download and install options
