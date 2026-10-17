# Tiebreak Tech export

OVS writes a Tiebreak Tech match database (`.db`, SQLite) from the match
analysis page (the "TB" button next to DataVolley and `.ovs`).

## How it works

```
MatchProject ──exportMatchToDataVolley──▶ .dvw text ──parseDataVolleyFile──▶ ParsedDataVolleyMatch ──writeTiebreakDatabase──▶ .db
```

The DataVolley export already works out rotations, setter positions and the
score of every rally; its parsed form is the same structure the Tiebreak Tech
importer (`import/parser/tiebreak-parser.ts`) produces, so the writer
(`export/tiebreak/tiebreak-writer.ts`) is the importer in reverse.

The file starts from `export/tiebreak/tiebreak-template.sql`: the full schema
of a real Tiebreak Tech file (51 tables, indexes) and its code tables only
(`d_*`, roles, countries, input maps). It holds no match or personal data.

## Tables written

| Table | Content |
|---|---|
| `team` | home (`ourteam = 1`) and away |
| `player`, `convocazioni` | roster; `name` is the family name, `surname` the given name; `role_id` 1 setter, 2 outside, 3 middle, 4 libero, 5 opposite, 0 unknown; starting positions per set |
| `game`, `game_finished` | sets won, date (`yyyymmdd`), start time |
| `sset` | score, duration (minutes), who served first; a set in progress is `open = 1` with the score reached |
| `event` | one row per action: skill (`IP_fondamentale`), grade (`mark` 1 `#` … 6 `=`), team, player, setter positions, score before the rally, time in ms from the start of the match; substitutions and timeouts as `OP_other_type` 2 / 1 |
| `azione` | one row per rally (first/last event, winner) |
| `rotations` | players in positions 1–6 and setter positions at the start of each rally |

Zone conventions (checked against a real file and its DataVolley export):
`pos_giocatore` is the start zone of serves and attacks and the reception
zone of receptions; `SERVE_direction` is where the serve lands (on serve and
reception); `ATT_cono` is `"<end zone>:-1:-1:"`; `ATT_breakpoint` is 0 for the
first attack after the team's reception, 1 in transition.

## Limits

- Serve types are float / jump float / jump spin only (H/M/Q); others are
  written without a type.
- Rule-violation rows, attack/dig/block sub-types and coordinates are not
  written.
- A point without any recorded action (e.g. a penalty) cannot be represented:
  Tiebreak Tech derives points from rallies. It is listed in the diagnostics.

## Tests

`export/tiebreak/tiebreak-export.test.ts`: a real Tiebreak Tech file read →
written → read gives the same players, actions, points and set scores; an OVS
match exported to `.db` and read back matches its DataVolley export.
