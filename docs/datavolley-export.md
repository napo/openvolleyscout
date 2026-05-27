# DataVolley Export v1

OpenVolleyScout can export a match project to a DataVolley-compatible `.dvw` file.
The export is **action-based**: it emits complete scout rows from OVS touch and event
data, not just statistics or summaries.

---

## References

The export was built against the same reference material used for the importer:

- **R**: [`openvolley/datavolley`](https://github.com/openvolley/datavolley) —
  `read_dv.R`, `meta.R`, `plays.R`, and validation helpers.
- **Python**: [`openvolley/py-datavolley`](https://github.com/openvolley/py-datavolley) —
  `read_dv.py` and helper parsing functions.
- **Sample files**: `/tmp/datavolley-samples/*.dvw` — real Italian Serie A1 and
  international matches.

The target compatibility tier is `[3DATAVOLLEYSCOUT]` files with:
`[3MATCH]`, `[3TEAMS]`, `[3SET]`, `[3PLAYERS-H]`, `[3PLAYERS-V]`, `[3SCOUT]`.

---

## Architecture

```
src/features/export/datavolley/
  index.ts                          Main facade: exportMatchToDataVolley()
  types.ts                          Export types: model, diagnostic, scout row
  diagnostics.ts                    Diagnostic codes and factory
  model/
    ovs-match-extractor.ts          OVS → DataVolleyExportModel
  serializer/
    datavolley-serializer.ts        DataVolleyExportModel → DVW text
  utils/
    datavolley-file-utils.ts        Filename generation + browser download
  validation/
    datavolley-export.validation.ts Round-trip validation module (for scripts/)
```

Each layer has a single responsibility:

| Layer | Input | Output |
|---|---|---|
| `ovs-match-extractor` | `MatchProject` | `DataVolleyExportModel` + diagnostics |
| `datavolley-serializer` | `DataVolleyExportModel` | `.dvw` text (string) |
| `datavolley-file-utils` | `MatchProject` | suggested filename + download trigger |
| `datavolley-export.validation` | `MatchProject` + real .dvw bytes | assertion count + warnings |

---

## Exported Sections (v1 scope)

| Section | Content |
|---|---|
| `[3DATAVOLLEYSCOUT]` | File-type header and generator metadata |
| `[3MATCH]` | Date, time, season, competition, round, match number |
| `[3TEAMS]` | Team IDs, names, sets won, head coach, assistant coach |
| `[3MORE]` | Venue (if available), placeholder referee fields |
| `[3COMMENTS]` | Placeholder |
| `[3SET]` | Played flag, final score, duration (when available) for all 5 set slots |
| `[3PLAYERS-H]` | Home roster: jersey, name, starting positions, special role, role code |
| `[3PLAYERS-V]` | Away roster: same layout |
| `[3ATTACKCOMBINATION]` | Empty in v1 |
| `[3SETTERCALL]` | Empty in v1 |
| `[3WINNINGSYMBOLS]` | Standard placeholder row |
| `[3RESERVE]` | Empty |
| `[3VIDEO]` | Empty |
| `[3SCOUT]` | Complete scout rows (see below) |

---

## Scout Row Format

Each exported scout row has 26 semicolon-delimited columns followed by a
trailing semicolon (to match the DataVolley desktop format):

```
code;pointPhase;attackPhase;;startCoord;midCoord;endCoord;time;setNum;homeSetter;awaySetter;videoFile;videoTime;;h1;h2;h3;h4;h5;h6;a1;a2;a3;a4;a5;a6;
```

| Field index | Name | Source |
|---|---|---|
| 0 | code | Generated from OVS touch data |
| 1 | pointPhase | `s` for serve phase |
| 2 | attackPhase | `r`/`s`/`p` from touch context |
| 3 | (reserved) | Always empty |
| 4 | startCoordinate | OVS start zone code |
| 5 | midCoordinate | (empty in v1) |
| 6 | endCoordinate | OVS end zone code |
| 7 | time | Touch `createdAt` as `HH.MM.SS` (UTC) |
| 8 | setNumber | From touch |
| 9 | homeSetterPosition | From active lineup |
| 10 | awaySetterPosition | From active lineup |
| 11 | videoFileNumber | `1` (fixed) |
| 12 | videoTime | Seconds relative to match start |
| 13 | (reserved) | Always empty |
| 14–19 | home lineup | Jersey numbers, 6 slots |
| 20–25 | away lineup | Jersey numbers, 6 slots |

---

## Action Code Format

DataVolley action codes follow the pattern:

```
{teamMarker}{jersey}{skill}{skillType}{evaluation}{actionCode}{setType}{startZone}{endZone}{endSubzone}~~~{customCode}
```

| Component | Examples |
|---|---|
| teamMarker | `*` (home), `a` (away) |
| jersey | `01`, `12`, `$$` (unknown) |
| skill | `S` serve, `R` receive, `E` set, `A` attack, `B` block, `D` dig, `F` freeball |
| skillType | `M` float, `Q` jump, etc. |
| evaluation | `=` error, `/` poor, `-` negative, `!` ok, `+` positive, `#` perfect |
| actionCode | Attack combination (2 chars) or setter call |
| startZone | Zone digit `1–9` |
| endZone | Zone digit `1–9` |
| endSubzone | Sub-zone letter `A–D` |

Unknown segments are filled with `~`.

---

## Timestamp and Action Timing

DataVolley scout rows must include a time field (`HH.MM.SS`).

The exporter applies the following rules:

1. **Real timestamp** — if `touch.createdAt` is ≥ `2000-01-01` (UTC epoch
   `946684800000`), it is formatted as `HH.MM.SS` (UTC hours/minutes/seconds).
2. **Deterministic fallback** — if no real timestamp exists, the exporter uses
   a monotonically increasing counter (1 second per row) and emits a
   `missing_timestamp` diagnostic.

Video time (`videoTime`) is derived from `touch.createdAt − matchStart` in
seconds when both are real timestamps.  Otherwise the fallback counter is used.

Actions are **never dropped** due to missing timestamps.

---

## Composed-Code Semantics

OVS preserves DataVolley composed-code conventions for receive/serve and
attack/block dependencies.

### Receive → Serve synthesis

When a `receive` touch exists without an explicit preceding `serve` touch in
the same rally, a synthetic serve row is inserted before the receive row.

| Receive evaluation | Synthetic serve evaluation |
|---|---|
| `=` | `#` |
| `/` | `/` |
| `-` | `+` |
| `!` | `!` |
| `+` | `-` |
| `#` | `-` |

### Attack → Block synthesis

When a `attack` touch with evaluation `/` or `!` exists without an explicit
following `block` touch on the opposing team, a synthetic block row is inserted
after the attack row.

| Attack evaluation | Synthetic block evaluation |
|---|---|
| `/` | `#` |
| `!` | `!` |

Explicit existing receives or blocks are **never duplicated**.

---

## Libero and Substitutions

| Event type | Exported as |
|---|---|
| `substitution_made` | `{marker}c{out}:{in}` scout row |
| `libero_replacement_made` | `{marker}c{out}:{in}` scout row + `unsupported_libero_event` info diagnostic |
| `timeout_called` | `{marker}T` scout row |

Full libero semantics (libero-specific `lL` markers) are not represented in
v1.  An `info` diagnostic is emitted for each libero replacement.

---

## Set Lineup Rows

Each `set_started` event generates four lineup rows before the set's scout
action rows:

```
*P{captain_or_first_home_jersey}>LUp     (home captain/lineup marker)
*z{homeSetterPosition}>LUp              (home setter position)
aP{captain_or_first_away_jersey}>LUp    (away captain/lineup marker)
az{awaySetterPosition}>LUp             (away setter position)
```

---

## Player Rows

Player rows are written in the order: home players (`[3PLAYERS-H]`), then away
players (`[3PLAYERS-V]`).  Players are sorted by jersey number within each side.

Player starting positions are exported as:
- Court position `1–6` for normal players who started that set
- `*` for libero players in a set
- Empty for players who did not start that set

---

## Direction and Zone Information

Zone data is extracted from OVS touch fields in priority order:

1. `touch.startZoneCode` / `touch.endZoneCode`
2. `touch.advancedDetails.*.startZone` / `*.targetZone`
3. `touch.ballDirection.courtZoneStart` / `.courtZoneEnd`
4. Grid coordinate → approximate zone mapping

When no zone information is available, the field is left empty (no invented
zone).  Unsupported coordinate formats emit an `unsupported_direction_format`
diagnostic.

---

## Diagnostics

The exporter produces structured diagnostics via `DataVolleyExportDiagnostic`:

```typescript
interface DataVolleyExportDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  touchId?: string;
  eventId?: string;
  setNumber?: number;
  rallyNumber?: number;
}
```

| Code | Severity | When |
|---|---|---|
| `missing_timestamp` | warning | Touch `createdAt` is not a real absolute timestamp |
| `missing_player_jersey` | warning | Touch references a player not found in roster |
| `missing_lineup` | warning | No active lineup context for a scout row |
| `unsupported_libero_event` | info | Libero replacement is written as a substitution row |
| `unsupported_event_type` | warning | An event type has no DataVolley representation in v1 |
| `unsupported_direction_format` | info | Zone/coordinate data cannot be mapped to DataVolley format |
| `regenerated_imported_code` | info | An originally-imported DataVolley code was regenerated from OVS fields |
| `missing_evaluation` | warning | Touch has no evaluation; neutral `!` is used |
| `round_trip_mismatch` | warning | Used in round-trip validation when metric diverges significantly |

Diagnostics are logged to the browser console when the UI export button is
used.  They are available programmatically via `DataVolleyExportResult.diagnostics`.

---

## UI Export Button

The **Export DataVolley** button appears on the Analysis page (`/analysis`)
alongside the existing **Open printable report** and **Download PNG** buttons.

- Available only when a match project is loaded.
- Generates the `.dvw` file and triggers an immediate browser download.
- Diagnostics are logged to `console.info` if any warnings or errors are present.

**Suggested filename format:**

```
{HomeTeam}-{AwayTeam} {homeSets}-{awaySets} ({set1score}, {set2score}, ...).dvw
```

Example:

```
Home-Volley-Away-Volley 3-1 (25-22, 22-25, 25-20, 25-18).dvw
```

Invalid filename characters are removed and spaces are replaced with hyphens.

---

## Round-Trip Validation

`scripts/validate-datavolley-export.mjs` performs:

1. Synthetic fixture: builds a full two-set OVS match in memory, exports it,
   re-parses the `.dvw` with the OVS DataVolley importer, and compares teams,
   players, sets, and touch counts.
2. Real sample files: for every `.dvw` in `/tmp/datavolley-samples/` (or
   `/tmp/` directly), imports → exports → re-parses and verifies structural
   consistency.

Run:

```sh
npm run validate:datavolley-export
```

---

## Known v1 Limitations

The following features are **not** implemented in v1:

| Feature | Reason |
|---|---|
| Full libero markers (`lL`) | DataVolley-specific semantics need further research |
| Video sync / camera offset | OVS does not record video offsets |
| Sanctions / red cards | Emitted as `unsupported_event_type` diagnostics |
| `[3ATTACKCOMBINATION]` content | Exported empty; attack codes use OVS raw values |
| `[3SETTERCALL]` content | Exported empty; setter call codes use OVS raw values |
| Score checkpoints (`[3SET]` fields 1–3) | Left empty; only final score is exported |
| Colour metadata per team | Not stored in OVS |
| `[3MORE]` referee names | Not stored in OVS |
| Player nationality / foreign flag | Always `False` |
| Encoded player name fields (hex) | Not generated; not required by readers |
| Full DataVolley XML variant | Out of scope |

---

## Relationship with the DataVolley Importer

The importer (`src/features/import/datavolley/`) and the exporter share the
same action-code semantics defined in the OVS scouting model.  See
[docs/datavolley-import.md](datavolley-import.md) for the import side.

A match imported from DataVolley and re-exported will:

- Preserve team names, jersey numbers, and starting positions.
- Regenerate action codes from OVS fields (not from the original raw code);
  an `regenerated_imported_code` info diagnostic is emitted per touch.
- Preserve set scores and match metadata.
- Produce a structurally valid `.dvw` readable by openvolley/datavolley and
  py-datavolley.
