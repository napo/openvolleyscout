# Mobile & Tablet Manual QA Checklist

## Test Session Details

| Field | Value |
| --- | --- |
| Device (model / OS) | |
| Browser & version | |
| App version | |
| Date | |
| Tester | |

## Checklist

| # | Area | Scenario | Expected Result | Pass / Fail |
| --- | --- | --- | --- | --- |
| 1 | Court mode (serve) | Phone portrait: tap each of the 5 serve start cells (zones 5, 7, 6, 9, 1) and drag to opponent court | Every cell is easy to tap without mis-hits; the serve arrow starts from the chosen cell | [ ] Pass / [ ] Fail |
| 2 | Court mode (serve) | Phone landscape: tap each of the 5 serve start cells (zones 5, 7, 6, 9, 1) and drag to opponent court | Every cell is easy to tap without mis-hits; the serve arrow starts from the chosen cell | [ ] Pass / [ ] Fail |
| 3 | Court mode (serve) | Tablet (portrait & landscape): tap all 5 serve start cells and export the match to DVW | Arrows start from the chosen cell; exported `.dvw` contains exact start zone codes `1`, `9`, `6`, `7`, `5` | [ ] Pass / [ ] Fail |
| 4 | Tags mode (serve & reception) | Rotate the court in all 4 orientations; inspect the 5-zone serve-start row and the reception origin row | All 5 serve zones (`5, 7, 6, 9, 1` in court order) stay aligned with the rotated court; reception origin row matches | [ ] Pass / [ ] Fail |
| 5 | Live scouting (double change) | Perform a setter-opposite double substitution during a set | The "Who is the new setter?" dialog opens; after confirming, court formation, rotation, and libero position are accurate | [ ] Pass / [ ] Fail |
| 6 | Analysis (filter panels) | Open Side-out study, Heatmaps (attacker views), and Opponent report editors; toggle evaluation/skill filter chips | Filter chips wrap cleanly on small screens, show evaluation colors clearly, and update charts/tables immediately | [ ] Pass / [ ] Fail |
| 7 | Analysis (efficiency note) | Inspect statistics tables in Match analysis and Team analysis | The efficiency formula note appears under the statistics and matches the active settings | [ ] Pass / [ ] Fail |
| 8 | Settings > Analysis | Edit efficiency weights in Settings > Analysis using the on-screen keyboard | Numeric/text inputs remain visible above the keyboard, accept edits without layout breakage, and persist after reload | [ ] Pass / [ ] Fail |
| 9 | Sharing (v2 link) | Click "Share via web" on an analysis tab, set expiry, generate link, and open it on a second phone | Button shows active/pressed state while panel is open; link opens on the second phone with readable tables/charts | [ ] Pass / [ ] Fail |
| 10 | Sharing (expiry & v1 link) | Open an expired link and an older version-1 SVG link | Expired link displays the expiry message; version-1 link still renders the SVG preview with zoom toggle | [ ] Pass / [ ] Fail |
| 11 | Confirmation dialogs | Open a confirmation dialog (e.g. delete/reset); test Tab, Shift+Tab, Esc, and touch targets | Focus stays inside dialog, Esc closes it, focus returns to the trigger button, and action buttons are at least 44x44 px | [ ] Pass / [ ] Fail |

## Problems Found

| # | Screen | Steps to Reproduce | What Happened | Screenshot / File |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
