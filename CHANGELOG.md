# Changelog

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
