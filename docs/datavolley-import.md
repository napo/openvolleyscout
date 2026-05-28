# DataVolley Import v1

OpenVolleyScout imports DataVolley matches through a dedicated import module in `src/features/import`.
The importer is intentionally split into parser, mapping, preview, diagnostics, and validation layers so format compatibility work does not redesign live scouting or the match report.

> **Export counterpart**: see [docs/datavolley-export.md](datavolley-export.md) for the
> DataVolley Export v1 that serialises OVS match projects back to `.dvw` files.
> The import and export share the same action-code semantics, skill mappings,
> and composed-code conventions.

## Reference Parsers

The v1 parser was built against the openvolley parser behavior and the real sample `.dvw` files in `/tmp/datavolley-samples`.

- R reference: `openvolley/datavolley`, especially `read_dv.R`, `meta.R`, `plays.R`, and validation helpers.
- Python reference: `openvolley/pydatavolley`, especially `read_dv.py` and helper parsing functions.
- OpenVolleyScout compatibility target: `[3DATAVOLLEYSCOUT]` files with `[3MATCH]`, `[3TEAMS]`, `[3SET]`, `[3PLAYERS-H]`, `[3PLAYERS-V]`, and `[3SCOUT]` sections.

## Architecture

- `parser/` decodes UTF-8 first, falls back to latin1/ISO-8859-1, splits DataVolley sections, and creates an intermediate parsed model.
- `mapping/` converts parsed matches into normal OVS `MatchProject` event logs.
- `preview/` summarizes parsed teams, score, set count, player count, action count, team archive changes, and diagnostics before saving.
- `persistence/` merges imported teams and rosters into the normal archived team storage during import confirmation.
- `diagnostics/` contains structured import warnings with `line`, `code`, `message`, and severity.
- `validation/` verifies replay ordering, point/set consistency, and stats compatibility after mapping.

## Intermediate Model

The parser returns `ParsedDataVolleyMatch`, not OVS touches directly.

It preserves:

- match metadata and source encoding
- home/away teams and staff fields
- players, jersey numbers, role codes, captain/libero markers, and starting positions
- set summaries and partial score fields
- scout rows, parsed actions, substitutions, timeouts, setter-position rows, lineup rows, and end-set markers
- raw DataVolley action codes
- diagnostics for unknown or unsupported rows

This intermediate model is the debugging boundary for future DataVolley compatibility.

## Mapping Philosophy

The mapper emits regular OVS events:

- `match_created`
- `set_started`
- `rally_started`
- `touch_recorded`
- `point_awarded`
- `substitution_made`
- `timeout_called`
- `rally_ended`
- `set_ended`

Imported matches therefore use the existing replay engine, stats engine, match report, evaluation charts, player stats, and team totals. There is no parallel stats system.

Mapped v1 skills:

- serve
- receive
- set
- attack
- block
- dig
- freeball

The mapper preserves player, team, evaluation, set number, rally number, touch order, DataVolley zones where available, attack/set codes, setter call codes, and custom tails where OVS has native touch fields.

## Composed Codes

The mapper ports the openvolley composed-code semantics needed for replay-compatible OVS touches:

- `receive =` infers opponent `serve #`
- `receive /` infers opponent `serve /`
- `receive -` infers opponent `serve +`
- `receive !` infers opponent `serve !`
- `receive +` infers opponent `serve -`
- `receive #` infers opponent `serve -`
- `attack /` infers opponent `block #`
- `attack !` infers opponent `block !`

If the source file already has an explicit serve or block in the rally, the mapper does not duplicate it.

## Lineups, Liberos, And Substitutions

V1 reads starters from `[3SCOUT]` lineup columns first, then player starting-position fields. It preserves libero and captain markers on OVS roster players and disables OVS automatic libero replacement for imported lineups.

Normal substitution rows like `*c05:12` or `aP08:11` are mapped to `substitution_made` events when both players are known. Unsupported lineup/personnel rows remain diagnostics and are not fatal.

## Team Persistence

When the user confirms a DataVolley import, OVS now saves both detected teams into the regular team archive before saving the match project.

The import uses normalized team names for dedupe. Normalization trims whitespace, removes accents, lowercases names, removes punctuation, and collapses spacing. If an archived team with the same normalized name already exists, the import updates that team instead of creating another one. If multiple archived teams collide on the same normalized name, the importer emits a warning, prefers an exact-name match, and otherwise updates the most recently changed matching team.

Roster merge rules are conservative:

- existing team names and manually edited staff are preserved; imported staff fills only empty archived staff fields
- players are matched by jersey number first, then by normalized full name when the jersey is not already known
- imported players that do not match an archived player are appended
- existing non-empty player names and player codes are preserved
- missing archived player names or codes can be filled from DataVolley
- imported captain/libero markers are added when present, but existing markers are not cleared
- the imported match is relinked to the archived team and archived player IDs after the merge, then replay/stat validation runs on the linked project

The preview shows whether each team will be created or updated and summarizes roster additions/updates. Diagnostics include duplicate jersey numbers, missing player names, conflicting captain/libero markers, imported home/away name collisions, and archive team-name collisions.

## Validation

The import validation helpers are:

- `validateImportedMatch()`
- `validateImportedStats()`
- `validateImportedRallies()`

They check:

- replayability through the normal OVS replay engine
- set start/end consistency
- point totals versus final set scores
- rally and touch ordering
- stats total touches versus event touches
- team-total consistency from the normal stats engine

## Known Limitations

V1 does not yet implement:

- DataVolley export
- exact rotation reconstruction for every rally
- full sanction/card/video-check mapping
- full libero entry/exit event inference from all vendor variants
- timeout counts by regulation
- green code semantics beyond preservation as diagnostics
- all attack combination and setter-call catalog fields
- custom scouting code taxonomies beyond native OVS fields

Unknown sections and unsupported scout rows produce diagnostics instead of failing the entire import.

## Tests

`npm test` runs `scripts/validate-datavolley-import.mjs`.

The validation suite covers:

- minimal DataVolley file parsing
- multi-set import
- libero and captain markers
- substitutions
- serve/receive composed mapping
- attack/block composed mapping
- malformed lines with warnings
- replay reconstruction
- stats generation
- team totals consistency
- creating reusable teams from imported `.dvw` files
- importing the same file twice without duplicating archived teams or roster players
- roster merge behavior for existing teams
- non-destructive preservation of existing team staff and player names
- linked imported matches opening/replaying after team persistence
- duplicate jersey, missing name, marker conflict, and team-name collision diagnostics
- real `.dvw` sample parsing from `/tmp/datavolley-samples` when that directory is available

## Synthetic ballDirection for Heatmaps

DataVolley action lines carry zone codes (`startZone` / `endZone`, characters 9–10 of the
action string after the raw code prefix).  These single-digit codes 1–9 map to the
standard volleyball court positions:

| Code | Position |
|------|----------|
| 1 | Back right (server / rotation 1) |
| 2 | Front right |
| 3 | Front center |
| 4 | Front left |
| 5 | Back left |
| 6 | Back center |
| 7 | Deep back left |
| 8 | Deep back center |
| 9 | Deep back right |

The mapper in `src/features/import/mapping/datavolley-zone-to-stage.ts` converts these
codes to full-stage `StagePoint` values and builds a `BallDirection` that is stored on the
imported `BallTouch.ballDirection` field — the same field used by natively scouted touches.

**Cross-net skills** (serve, attack, freeball): start on the acting team's court, end on the
opponent's court.

**Receive**: start on the opponent's court (origin of the incoming ball), end on the acting
team's court.

**Own-court skills** (dig, block, set, cover): both points on the acting team's court.

**Inferred blocks** (synthesized from attack actions) do not receive a `ballDirection`
because their zone codes come from the attacker's perspective and would be misleading.

The raw zone codes are preserved in `BallTouch.startZoneCode`, `BallTouch.endZoneCode`, and
`BallDirection.courtZoneStart` / `BallDirection.courtZoneEnd`.

### Coordinate system

DataVolley imports always place the home team on the LEFT side of the stage (display side
`'left'`) and the away team on the RIGHT (display side `'right'`).  The conversion inlines
the same half-court→stage math used by `mapHalfCourtSystemPointToLiveCourt`:

```text
stageX(left) = 50 − (depth × 38) / 100
stageY(left) = 12 + (lateral × 76) / 100
right-side = mirror: {100 − x, 100 − y}
```

### Limitations

- Only single-digit zone codes 1–9 are supported.  Sub-zone letters (e.g. `4b`, `9a`) are
  not resolved; the touch receives no `ballDirection` and a `'unsupported_zone_code'`
  diagnostic is recorded internally.
- Zone positions are approximate (zone-center level, ±half a rotation zone).  They are
  accurate enough for heatmap density grids but not for precise trajectory animation.
- Actions without zone codes (e.g. `set` actions in many DVW files) produce no
  `ballDirection`.  The heatmap diagnostics footer reports the coverage rate.

## Tests

`npm test` runs `scripts/validate-datavolley-import.mjs`.

The validation suite covers:

- minimal DataVolley file parsing
- multi-set import
- libero and captain markers
- substitutions
- serve/receive composed mapping
- attack/block composed mapping
- malformed lines with warnings
- replay reconstruction
- stats generation
- team totals consistency
- **synthetic ballDirection for serves, receives, and attacks with zone codes**
- **heatmap events are non-empty after zone-based ballDirection generation**
- **touch without zone codes produces no ballDirection**
- creating reusable teams from imported `.dvw` files
- importing the same file twice without duplicating archived teams or roster players
- roster merge behavior for existing teams
- non-destructive preservation of existing team staff and player names
- linked imported matches opening/replaying after team persistence
- duplicate jersey, missing name, marker conflict, and team-name collision diagnostics
- real `.dvw` sample parsing from `/tmp/datavolley-samples` when that directory is available

## Roadmap

Next import iterations should add richer personnel-state reconstruction, exact serving-order/rotation replay, a broader DataVolley section catalog, more vendor variants, and eventually export once import behavior is stable.
