# Tactical report workflow checks

Use an isolated browser profile so the checks do not alter the user's archive.
Enable the experimental tactical reports feature in Settings.

1. Import several matches with stable archived team/player identities. Assign
   two different competitions and at least two season values.
2. Create a tactical report. Verify that the most recent competition/season is
   selected, its matches are preselected, and other matches can be included.
   Verify both team samples, insufficient-data states, and the similarity help.
3. Create the draft. Verify the initial priorities, serve targets, setting
   distribution, block/defence and serve cards. Overview and detailed reception
   cards should be available through Add sheet, not inserted automatically.
4. Edit text and table cells, reorder sheets, duplicate an analysis sheet, then
   edit the original. The copy must retain its independent text/table edits.
5. Add several extra sheets with half/full courts and both orientations. Add
   players, target areas, straight/curved arrows, cones and text. Check mouse and
   touch movement, undo/redo and a cancelled touch gesture. In the shared SVG
   toolbar check tooltips, active tools, keyboard tool shortcuts and arrow-key
   toolbar navigation. Change colors, numbers, labels, size, curve, thickness
   and opacity through contextual widgets; a slider gesture must undo once.
   Duplicate/delete a selected shape. Zoom and pan, drag at the changed scale,
   then fit the view; exports must keep their original document coordinates.
   Repeat on a generated analysis court and an extra sheet. Properties should
   appear beside the court on desktop and below it on tablet/phone.
6. Leave immediately after an edit and reopen. The latest content should be
   persisted. Report legacy order and overrides should survive source changes.
7. At tablet and 390 px phone widths, check menus, tables, source selection and
   drawing tools. Tables may scroll locally; the document must not overflow.
8. Export PDF and SVG ZIP. Render every PDF page and inspect headers, footer,
   page breaks, long notes, monochrome status cues and low-sample markers.
   Check Arabic word order, mixed Latin names/numbers and RTL phone layout.
   Parse every SVG and verify editable text/vector shapes and download links.
9. Add individual reception/attack cards with synced YouTube sources across
   multiple matches. Check player identity, skill filters, distinct videos and
   playable-action coverage. Matches with local or missing video must not
   produce public video links.
10. Open a shared web snapshot in a clean profile without archive data. Check
    sheet zoom, video links, expiry, invalid links and size-limit errors. Editing
    the original report must not mutate an existing shared snapshot.
11. Check all ten locale dictionaries and translated workflow placeholders.
    Run `npx tsc --noEmit`, `npm test` and `npm run build` before committing.
