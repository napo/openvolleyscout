# Match Lineup Model

OpenVolleyScout keeps official set participation separate from live tactical rendering.
The tactical court answers "where is this player drawn right now?"; the lineup
model answers "how should this set be represented in an official tabellino?"

## Official Participation

The report participation model is built around team-scoped player identity:

```ts
`${teamSide}:${playerId}`
```

This prevents home and away players with the same player id or player code from
colliding in report state.

`PlayerSetParticipation` records, per player and set:

- team side and player id
- whether the player started the set
- the official starting rotation position, if any
- whether the player entered through a normal substitution
- entry order and rally number
- first-server marker
- libero status and libero replacement history
- whether the player later exited

## Set Snapshots

`SetLineupSnapshot` is the set-level administrative read model. It stores:

- set number and team side
- `startingPlayerIdsByRotation` for positions 1 through 6
- `firstServerPlayerId`
- ordered normal substitution entries
- libero replacement events

Snapshots are reconstructed from `set_started`, `substitution_made`, and
`libero_replacement_made` events. New scouting session snapshots also persist the
reconstructed lineup snapshots so save/load can restore the same report model.
Old sessions without snapshots continue to load by reconstructing from events or
falling back to blank participation rows.

## Tactical vs Report Position

Starting rotation position is captured only from set setup. It is not updated by
side-out rotations, court inversion, or visual mirroring.

Live tactical coordinates and active court slots may change every rally. Report
rotation positions do not: a player who started in rotation 3 remains reported as
the rotation 3 starter for that set even after the live court rotates.

## Substitutions

Normal substitutions create `PlayerSetEntry` records with:

- entering player
- leaving player
- set number
- rally number
- stable entry order
- later exit information when the entrant leaves

Libero replacements are not normal substitutions and do not create normal entry
markers.

## Libero Tracking

Libero participation is tracked as `LiberoSetReplacement` history:

- libero player id
- replaced player id
- rally where the libero entered
- rally where the libero exited, if known
- second-libero swap marker

For a libero-to-libero swap, the outgoing libero replacement is closed and a new
replacement opens for the incoming libero while preserving the original replaced
player id.

## First Server

The first server is resolved from the configured serving team and the player in
starting rotation position 1 at set start. Court side inversion and later
rotations do not change this identity.

## Replay Reconstruction

Replay rebuilds active tactical lineups for live scouting and also reconstructs
lineup snapshots for report participation. Undo, redo-style event replacement,
score corrections, set transitions, and save/load all flow through the event log,
so the official participation model follows the same replay source of truth.
