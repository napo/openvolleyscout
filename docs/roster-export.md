# Roster Export

## Supported formats

- JSON
- CSV

This feature exports archived team roster data only. Match, rally, touch, and DataVolley match export are not included in v1.

## JSON schema

The JSON export uses a stable package format for future compatibility.

```json
{
  "format": "ovs-roster",
  "version": 1,
  "teams": [
    {
      "teamId": "...",
      "teamName": "...",
      "shortName": "...",
      "federation": "...",
      "club": "...",
      "createdAt": 1234567890,
      "updatedAt": 1234567890,
      "staff": {
        "headCoach": "...",
        "assistantCoach": "...",
        "scout": "...",
        "statistician": "..."
      },
      "players": [
        {
          "playerId": "...",
          "playerCode": "...",
          "jerseyNumber": 12,
          "firstName": "...",
          "lastName": "...",
          "displayName": "...",
          "role": "...",
          "isCaptain": true,
          "isLibero": false,
          "handedness": "...",
          "birthDate": "...",
          "notes": "..."
        }
      ]
    }
  ]
}
```

### JSON export behavior

- preserves full roster fidelity
- uses stable keys and explicit versioning
- can include optional fields when available
- supports future schema evolution with `format` and `version`

## CSV columns

The roster CSV export includes the following columns:

- TeamId
- TeamName
- TeamShortName
- Federation
- Club
- TeamCreatedAt
- TeamUpdatedAt
- Coach
- AssistantCoach
- Scout
- Statistician
- PlayerId
- PlayerCode
- JerseyNumber
- FirstName
- LastName
- DisplayName
- Role
- Captain
- Libero
- Handedness
- BirthDate
- Notes

CSV output is generated as UTF-8 with a header row and values quoted for spreadsheet compatibility.

## Filename rules

Generated filenames are sanitized to remove invalid filesystem characters and normalize accents.

Examples:

- `Team-Name-roster.json`
- `Team-Name-roster.csv`
- `OpenVolleyScout-rosters.json`
- `OpenVolleyScout-rosters.csv`

## Diagnostics

The export system produces structured diagnostics for export validation:

- `severity`: `info`, `warning`, or `error`
- `code`: diagnostic code
- `message`: human-readable detail
- `teamId`: optional team scope
- `playerId`: optional player scope

### Example diagnostics

- missing jersey number
- duplicate jersey number
- missing player name
- invalid role
- unsupported field

Diagnostics are exposed during export validation and do not block export unless the payload is critically malformed.

## Future roadmap

Planned future roster export extensions:

- XLSX export
- ODS export
- DataVolley roster-only export
- federation-specific roster schemas
- roster import UI

Non-goals for v1:

- XLSX/ODS export
- DataVolley match export
- match/rally/touch export
- roster import UI
- federation-specific formats
