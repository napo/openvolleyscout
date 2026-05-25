# DataVolley Import v1

OpenVolleyScout imports DataVolley matches through a dedicated import module in `src/features/import`.
The importer is intentionally split into parser, mapping, preview, diagnostics, and validation layers so format compatibility work does not redesign live scouting or the match report.

## Reference Parsers

The v1 parser was built against the openvolley parser behavior and the real sample `.dvw` files in `/tmp/datavolley-samples`.

- R reference: `openvolley/datavolley`, especially `read_dv.R`, `meta.R`, `plays.R`, and validation helpers.
- Python reference: `openvolley/pydatavolley`, especially `read_dv.py` and helper parsing functions.
- OpenVolleyScout compatibility target: `[3DATAVOLLEYSCOUT]` files with `[3MATCH]`, `[3TEAMS]`, `[3SET]`, `[3PLAYERS-H]`, `[3PLAYERS-V]`, and `[3SCOUT]` sections.

## Architecture

- `parser/` decodes UTF-8 first, falls back to latin1/ISO-8859-1, splits DataVolley sections, and creates an intermediate parsed model.
- `mapping/` converts parsed matches into normal OVS `MatchProject` event logs.
- `preview/` summarizes parsed teams, score, set count, player count, action count, and diagnostics before saving.
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
- real `.dvw` sample parsing from `/tmp/datavolley-samples` when that directory is available

## Roadmap

Next import iterations should add richer personnel-state reconstruction, exact serving-order/rotation replay, a broader DataVolley section catalog, more vendor variants, and eventually export once import behavior is stable.
