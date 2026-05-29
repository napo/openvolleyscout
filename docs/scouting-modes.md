# Scouting Modes

OVS supports two scouting modes that control how much detail is required when recording touches.

## Modes

### Simple mode (default)

- Optimised for fast, continuous scouting
- Allows default skill/evaluation commits with fewer taps
- Infers details where possible (e.g. serve from reception)
- Suitable for solo scouts tracking the match flow in real time

### Advanced mode

- Designed for experienced DataVolley / Click&Scout users
- Requires explicit skill and evaluation selection
- Enables additional metadata fields (serve type, attack tempo/type, set type)
- Produces richer data for post-match analytics

## Switching modes

The mode selector is visible during the `live_rally` stage when no rally is active.

```
Scouting mode: [ Simple ▾ ]   ← tap to switch
```

> Mode changes are blocked while a rally is active to preserve pending touches, ace selection, and libero flow integrity.

## Persistence

The active scouting mode is persisted immediately to the match project in IndexedDB on every change. It survives page reloads and navigation away from the scouting page.

During project load, the mode is restored from the persisted scouting session. If event
replay is unavailable, the fallback session restore still preserves the active mode
and normalizes the live match state.

### History of the persistence bug (fixed 2026-05-29)

Before the fix, `setScoutingMode()` updated Zustand state in-memory but did **not** immediately persist to the project. The deferred sync hook would eventually write the mode, but a reload before the sync ran would reset to 'simple'. The fix adds an explicit `persistProject(updateProjectScoutingMode(...))` call right after the in-memory update.

## Configuration (`ScoutingModeConfig`)

The mode drives the `ScoutingModeConfig` object used throughout the scouting flow:

| Config key | Simple | Advanced |
|---|---|---|
| `density` | `compact` | `detailed` |
| `allowDefaultSkillCommit` | true | false |
| `allowDefaultEvaluationCommit` | true | false |
| `requiredExplicitInput.skill` | false | true |
| `requiredExplicitInput.evaluation` | false | true |
| `prepareInference` | true | false |
| `touchOrigin` | `live_scouting` | `live_scouting` |

## Diagnostic notes

If the mode resets unexpectedly in DEV builds, `console.info` messages from `syncWithProject` will indicate whether the guard was bypassed. Look for:

```
[OpenVolleyScout] syncWithProject skipped: liveMatch is ahead of persisted project
```

If this log is absent when a reset occurs, the project was loaded before the mode change was written (e.g., fast reload or concurrent writes).
