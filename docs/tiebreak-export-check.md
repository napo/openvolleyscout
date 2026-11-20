# Tiebreak Tech `.db` Export Verification Guide

This checklist describes how to verify an OpenVolleyScout `.db` export inside Tiebreak Tech, complementing the automated structural and round-trip checks in `src/features/export/tiebreak/tiebreak-export.test.ts`.

## Automated Checks Already Covered

Before testing manually in Tiebreak Tech, run:

```bash
npx vitest run src/features/export/tiebreak/tiebreak-export.test.ts src/features/import/parser/tiebreak-parser.test.ts
```

The test suite verifies:
- Identical table and column layout compared with a real Tiebreak Tech `.db` file.
- Zero foreign-key violations (`PRAGMA foreign_key_check`).
- No `NULL` values in required fields (`team`, `player`, `game`, `sset`, `event`, `azione`).
- `event.time` encoded as valid `HHMMSSmmm` decimal timestamps (`hh < 24`, `mm < 60`, `ss < 60`).
- Serve start zones written to `event.SERVE_from` (`1, 5, 6, 7, 9`).
- Lossless touch round trip (Tiebreak import -> export -> import).

## Steps to Open in Tiebreak Tech

1. In OpenVolleyScout, open a completed match (either imported or scouted live).
2. Open the export menu and choose **Tiebreak Tech (.db)** to save the file locally.
3. Launch Tiebreak Tech on Windows/macOS.
4. Go to **File > Open** (or **Import Match**) and select the exported `.db` file.
5. Confirm the match opens without database errors or missing-table dialogs.

## What to Inspect

1. **Teams and rosters**: Verify home and away team names, jersey numbers, player first/last names (Tiebreak Tech stores family name in `name` and given name in `surname`), captain marker, libero role, and starting positions per set.
2. **Set scores and match result**: Verify the set-by-set scores and total sets won match OpenVolleyScout.
3. **Rotations and setter positions**: Step through several rallies in Set 1 (and after substitutions) and confirm `pos0`/`pos1` setter positions and the six court players match the scouting log.
4. **Serve start zones and directions**: Open the serve chart/breakdown and verify serves originate from the expected baseline zones (`1, 9, 6, 7, 5` via `SERVE_from`) and land in the expected reception zones (`SERVE_direction`).
5. **Attack cones, types, and blockers**: Inspect a sample of attacks to verify cone/target zone (`ATT_cono`), attack type (`ATT_type`), and blocker count (`num_giocatori_muro`).
6. **Video sync**: If the match has a linked video file, associate the video in Tiebreak Tech and jump to 3-5 rallies across the match; verify the `HHMMSSmmm` timestamps land on the expected touches.

## Manual Verification Results

| Date | Tiebreak Tech version | Source match | Teams & rosters | Set scores | Rotations | Serve zones | Video sync | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | [ ] Pass / [ ] Fail | [ ] Pass / [ ] Fail | [ ] Pass / [ ] Fail | [ ] Pass / [ ] Fail | [ ] Pass / [ ] Fail | | |
