# ScoutingPage Organization

`src/features/scouting/pages/ScoutingPage.tsx` coordinates live scouting across pre-match configuration, set setup, live rally input (court, tags, detailed codes), end-of-set, and match-end stages.

## Extracted Components

- `src/features/scouting/components/ScoutingTopBar.tsx` (+ `ScoutingTopBar.test.tsx`): desktop scoreboard header, team +1/undo controls, timeouts/substitutions quick triggers, setter rotation indicator, rally metadata row, input-mode toggle, and DataVolley rally code strip.
- `src/features/scouting/components/SetterAssignmentDialog.tsx` (+ `SetterAssignmentDialog.test.tsx`): modal prompting the scout to pick the new setter after a substitution removes the current setter (such as a setter-opposite double change).
- `src/features/scouting/components/LiveExitDialog.tsx` (+ `LiveExitDialog.test.tsx`): modal offering Go to analysis, Suspend, Delete & restart, App menu, and Back to scouting, with Escape handling.
- Existing stage components already imported by `ScoutingPage.tsx`: `PreMatchConfigStage`, `SetSetupStage`, `LiveRallyStage`, `SetEndStage`, `MatchEndStage`, `PointNoteModal`, `InputLevelChooser`, `ScoutingOnboardingCard`, and `LiveScoutingVideoPanel`.

## Blockers for Further Extraction

Stopping further extraction here rather than forcing >15-prop wrappers:

1. **Manage-action dialog (`manageActionPanel`)**: tightly coupled to ~24 shared state/handler closures in `ScoutingPage` (`manageActionDraft`, `liveMatch`, `primaryAutomaticLiberoProposal`, `correctableSetStart`, `handleManageActionTeamChange`, `handleManageActionTypeChange`, `handleManageActionConfirm`, `applyLiberoProposal`, `getLibero*Message`, `getPlayerLabel`, video-check context, and substitution eligibility). Extracting it cleanly requires first moving `manageActionDraft` and its handlers into a dedicated custom hook or Zustand slice.
2. **Set setup & end-of-set stage wiring (`stageContent`)**: `SetSetupStage` and `SetEndStage` are already separate presentational components; the remaining glue inside `ScoutingPage` wires `setStartDraft`, quick-jersey roster additions, and `stageOverride` transitions directly into `useScoutingStore`.
3. **Video side panel**: `liveVideoPanelRef` is read synchronously inside `recordTouch`, `recordPoint`, and `actionStartVideoSecondsRef` callbacks during live rally input; moving it into a standalone hook requires introducing an imperative clock-provider ref shared with the rally commit handlers.
