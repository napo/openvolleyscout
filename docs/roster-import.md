# Roster Import

OpenVolleyScout supports importing team rosters from two formats: OVS JSON and CSV.

## Accessing the import UI

On the **Teams** page, click the **Import** button in the actions bar at the top.
This opens the Roster Import modal dialog.

## Supported formats

| Format       | Extension | Description                                          |
|--------------|-----------|------------------------------------------------------|
| OVS JSON     | `.json`   | Full OVS roster export package (round-trip fidelity) |
| CSV          | `.csv`    | Simple spreadsheet format, template-compatible        |

The format is auto-detected from the file extension.

## OVS JSON format

Import an OVS JSON file previously exported from OpenVolleyScout (or hand-crafted to match the schema):

```json
{
  "format": "ovs-roster",
  "version": 1,
  "teams": [
    {
      "teamId": "...",
      "teamName": "...",
      "players": [
        {
          "playerId": "...",
          "jerseyNumber": 10,
          "firstName": "...",
          "lastName": "...",
          "isCaptain": false,
          "isLibero": false
        }
      ]
    }
  ]
}
```

Required fields: `format`, `teams[].teamName`, `teams[].players[].jerseyNumber`, `teams[].players[].firstName`, `teams[].players[].lastName`.

## CSV format

### Simple template (recommended for manual entry)

Use the **Download CSV template** button in the Import modal to get a ready-to-fill template.

Template columns:

| Column       | Required | Description                              |
|--------------|----------|------------------------------------------|
| Team         | yes      | Team name                                |
| JerseyNumber | yes      | Player jersey number (integer)           |
| FirstName    | yes*     | Player first name (* or use FullName)    |
| LastName     | yes*     | Player last name  (* or use FullName)    |
| FullName     | no       | Full name; split if FirstName/LastName absent |
| Role         | no       | Role (e.g. setter, libero, outside)      |
| Captain      | no       | `true` / `false` / `1` / `0` / `yes`    |
| Libero       | no       | `true` / `false` / `1` / `0` / `yes`    |
| PlayerCode   | no       | Short player code (auto-generated if absent) |

Example:

```csv
Team,JerseyNumber,FirstName,LastName,FullName,Role,Captain,Libero,PlayerCode
My Team,10,Anna,Rossi,Anna Rossi,setter,false,false,ANR
My Team,7,Marco,Bianchi,,outside,false,false,MBI
```

### Full export CSV (round-trip)

A CSV file previously exported from the Export modal can be re-imported directly.
Required columns from this format: `TeamName`, `JerseyNumber`, `FirstName`, `LastName`.

## Import behaviour

- If a team with the same name already exists, its roster is **replaced** with the imported players.
- If no matching team is found, a **new team** is created.
- Player IDs are regenerated on import.
- Staff (head coach, assistant coach) is not carried over from CSV; use OVS JSON for full fidelity.

## Preview

Before confirming, the Import modal shows:
- Detected format
- Number of teams and players found
- Any diagnostics (errors, warnings)

Import is blocked if the file contains errors. Warnings allow import to proceed.

## Diagnostics

| Code                | Severity | Description                                       |
|---------------------|----------|---------------------------------------------------|
| `empty_csv`         | error    | CSV file is empty                                 |
| `invalid_csv_header`| error    | Missing required columns                          |
| `no_teams`          | warning  | No teams found in the file                        |
| `invalid_json`      | error    | JSON cannot be parsed                             |
| `invalid_format`    | error    | JSON `format` field is not `ovs-roster`           |
| `missing_teams`     | error    | JSON missing `teams` array                        |
| `invalid_team`      | warning  | Non-object team entry in JSON                     |
| `missing_team_name` | warning  | Team entry has no name                            |
