# Changelog

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
