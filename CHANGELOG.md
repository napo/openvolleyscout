# Changelog

## Unreleased

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

## 0.18.5 — 2026-10-18

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

## 0.18.4 — 2026-10-17

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

## 0.18.3 — 2026-10-16

### Fixed
- Live video beside the vertical court on a small laptop screen: the
  picture was a thin strip. The playback bar and "Remove video" now share
  one row and the eight skill buttons fit on one row, so the picture is
  about twice as wide and tall.

### Changed
- Italian: "rilevazione" instead of "scoutare" ("Inizia la rilevazione").

## 0.18.2 — 2026-10-14

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

## 0.18.1 — 2026-10-13

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

## 0.18.0 — 2026-10-13

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

## 0.17.5 — 2026-10-12

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

## 0.17.4 — 2026-10-12

### Fixed
- DataVolley files that record attacks, blocks or serves by a libero (for
  example files from Click&Scout) can be imported again. These touches are
  still left out of the statistics, and the import now shows a warning for
  each one instead of stopping with an error.

## 0.17.3 — 2026-10-04

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

## 0.17.2 — 2026-10-03

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

## 0.17.1 — 2026-09-29

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
  video — the regular "Export DataVolley" button included.
- The "Export DVW with synchronized video times" button moved from the
  Analysis page header into the Video analysis synchronization section. It
  is available as soon as a sync point exists (the section says so while it
  is disabled). Its separate options (first-serve position, YouTube start
  link, time shift) are gone: synchronization is done with the sync points.

## 0.17.0 — 2026-09-28

Scouting for match day on tablets: jersey-first rosters, three input levels
(Court / Detailed / Tags), an installable offline web app, and vector PDFs.
Several of these features were adapted from the SyncScout Live fork by
courtendvb — thanks for the contribution.

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

## 0.16.1 — 2026-09-15

### Fixed
- Side-out study: a reception-phase attack with no recorded "set" touch was
  always attributed to a direct second-touch attack by the setter, zeroing
  out the whole zone-distribution breakdown. Many real DataVolley scout
  files (Click&Scout exports included) never log the set as its own row at
  all — the set is meant to be inferred. The classification now only
  treats it as a setter's own attack when the second-touch player is
  actually a roster-flagged setter; otherwise it falls back to zone
  classification (an implicit, unlogged set), attributing the "who set it"
  role to the team's real setter instead of the attacker.

## 0.16.0 — 2026-09-15

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

## 0.15.1 — 2026-09-08

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

## 0.15.0 — 2026-09-08

### Added
- Quick-scout live flow: attack input is now player-first — the attacker is
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
  toggled with the "⇄" button) — the swap state was plain component state
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

## 0.14.3 — 2026-08-03

### Fixed
- macOS release builds: ad-hoc sign the `.app` bundle in CI before it's
  wrapped into the `.dmg`, so Gatekeeper reports the bypassable
  "unidentified developer" warning instead of "is damaged and can't be
  opened" on downloads carrying the browser quarantine flag.

## 0.14.2 — 2026-08-03

### Added
- Side-out study: a "By call" view groups the setter distribution by attack
  combination / setter call code (falling back between the two, matching
  DataVolley's own "Distribuzione su basi" report) instead of only by court
  zone — one court per distinct call, with a rotation filter and an empty
  state when the match has no call codes recorded.

### Changed
- Vertical court live scouting: the manual code-entry panel now docks as a
  collapsible right-side rail (closed by default) instead of sitting open
  below the court, freeing height back to the court, which always keeps
  priority for space.
- Vertical court live scouting: the toolbar (skill/evaluation/ball-type
  controls) now matches the court's actual rendered width — its landscape-
  oriented 5-column layout used to collapse the skill selector to 0 width on
  narrow portrait courts, producing a broken one-button-per-row column; it
  now stacks as compact full-width wrapping rows sized to the court.

### Fixed
- Attack/serve heatmap: out-of-bounds errors (evaluation `=`) landing past
  the court are now drawn extended past the boundary for serves too, not
  only attacks (the two-panel arrows view already did this for attacks as
  of 0.14.0).

## 0.14.0 — 2026-08-01

### Changed
- Block-touch recording during live scouting: removed the mid-drag "pause at
  the net" timing gesture (180ms dwell) — timing-based detection was
  unreliable across devices/hand speed. The single remaining mechanism is
  the two-drag flow (drag to the net's block area, then a second drag to the
  deflection's landing point), matching Click&Scout's own design. The net's
  "block area" band is now wider (5% of court width, up from 2%) so the
  release is easier to land
- Team situation analytics: removed the "Transizione CP"/"Transizione BP"
  tiles — the underlying `transition_attack` rally phase could never
  actually be produced by the classifier once the exchange-count fallback
  was added (every rally with a winning attack resolves to
  `attack_after_receive` or `attack_after_dig` first), so the tiles always
  read empty. "CP length"/"BP length" (average exchanges per rally) already
  cover the same "how long do rallies run" question

### Fixed
- Attack heatmap: attacks landing out of bounds (evaluation `=`) were
  folded into the nearest in-court zone instead of reading as out — the
  two-panel arrows view now draws the landing point past the court
  boundary, extended along the attack's own trajectory; the single-court
  view excludes them from the grid and shows a "+N errors" note instead of
  silently dropping them. Court boundary, 3m line and net markings on the
  single-court view are also visible again (they were drawn in white,
  invisible against the view's now-white background)

## 0.13.1 — 2026-07-31

### Fixed
- Match report team totals row: reception Pos%, attack K%/Eff%, and serve
  Pos%/Eff% were computed from a denominator that was silently doubled (a
  `reduce` accumulator was seeded with the already-summed total instead of
  0, then summed again on top of it). Raw counts and Prf% were unaffected,
  but the halved rates could read lower than Prf% — impossible under the
  real formula — and disagreed with the independent set-summary table
  showing the correct value
- Side-out study rotation cards: the count shown next to "Alzatore (2°
  tocco)" / "Alzata senza attacco" was the attack-filter-narrowed count
  instead of the bucket total, invisible with all attack-result filters on
  but inconsistent with the percentage once they're narrowed

## 0.13.0 — 2026-07-30

### Added
- "Sperimentazioni" (Experimental features) section in Settings, gating the
  five Trends sub-tabs (Priorities, Similarity, Season trend, Competition
  comparison, Rally model) as individual, off-by-default toggles. The Trends
  tab itself only appears once at least one is enabled
- The live video panel now docks flush beside the court, sharing the row's
  width, whenever the court is in vertical orientation and the panel is
  open — instead of floating over the court and leaving dead space around
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
  Two touches recorded in the same millisecond — routine when one is
  inferred immediately from another, e.g. a serve inferred from a
  reception — silently collided, and one was dropped from every derived
  stat. Most visibly, the side-out study could show zero or an incomplete
  rotation distribution for a team. IDs are now generated with
  `crypto.randomUUID()`

## 0.12.0 — 2026-07-24

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
  freeball touch — those aren't always recorded by the scout, and the
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
  `OpenVolleyScout-*` filename — silently breaking in-app auto-update on
  Windows and Linux since v0.11.0 (macOS was unaffected). Both filenames
  are now kept

## 0.11.0 — 2026-07-21

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
  probabilities — the odds a rally ends in a point, estimated per game
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
