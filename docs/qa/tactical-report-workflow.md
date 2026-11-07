# Tactical report workflow checks

Use an isolated browser profile so the checks do not alter the user's archive.

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


## Booklet and priority regression checks

- Create a fresh report and choose Compact, Extended (default), or Custom before
  creating the draft. Check the actual page count, A4 sheet count and padding
  notes. Long coach text and additional players may exceed the base 4/8 pages.
- Verify ten proposals at most, three primary positions, two secondary positions
  with independent print flags, and reserves below position five. Reorder using
  both dragging and the keyboard-accessible up/down buttons; exclude a secondary
  and move it into the first three (it must print as a primary).
- Edit an automatic sentence, restore it, remove it, and add a manual sentence.
  Reopen the report and switch language: automatic templates change language;
  coach text, order and print flags remain unchanged. Frozen legacy list edits
  remain coach text until explicitly replaced.
- Verify that serve targets require known rally outcomes for both the receiver
  and other receivers in the same rotation, with adequate samples. A poor
  reception grade alone must not generate a target. No transition-phase-drop
  instruction should be generated.
- Export A5 reading order and A4 booklet faces. For 4/8/12 logical pages verify
  2/4/6 physical PDF pages, respectively. Print landscape, actual size, duplex
  short-edge; do not apply a second booklet imposition in the printer dialog.
- Check all six reception courts, every attack direction court and both setter
  reception bands. The main setter is chosen by classified setting attempts.
  Court overrides, titles, samples and notes must survive. Only uniform scaling
  is allowed; no court can be stretched to fit a slot.
- In Custom enable opponent serves, secondary-setter charts, and selected board
  extras independently. Secondary setters retain a textual summary otherwise.
  Source-zone/target-zone links are not measured ball trajectories.
- Render every exported page, including Arabic/CJK reports and imposed faces.
  Inspect long names, manual notes, priority highlighting and the small left
  footer (metadata author/URL, free software, GNU AGPL v3 or later
  (AGPL-3.0-or-later)). The header must not repeat the software name.
- The original A4 export and SVG/shared snapshots remain available; switching
  booklet format must not mutate saved board selections or customizations.


## Editable presentation formats

- The export menu lists PDF variants, PPTX, ODP and SVG (ZIP), without external
  editor recommendations or links. Verify the same choices in every locale.
- Export PPTX and ODP from the same booklet selection. Verify logical A5 pages
  in reading order, native editable text and vector objects, Unicode labels,
  colors, opacity, court proportions and arrowheads. No page may be flattened
  to a bitmap or a single picture.
- Open both presentation packages, render every page, and compare with the A5
  PDF and SVG pages. Check zero text-frame insets/no wrapping and horizontal
  or vertical lines (including the net and the three-metre line).
- ODP must put the uncompressed OpenDocument presentation mimetype first and
  include its manifest. PPTX internal relationships must resolve to existing
  package parts. Check every XML document for well-formedness.
- SVG ZIP uses the current booklet pages, including coach edits and the selected
  extras. Existing public shared snapshots remain immutable.

### Export menus and full A4

- Check the separate Preview, PDF and SVG icon menus, including keyboard activation.
- PDF offers A4, Booklet (compact), Booklet extended, PPTX and ODP.
- A4 uses the extended booklet style on portrait A4 sheets, keeps mandatory diagrams, player statistics, selected extra sheets and notes; it does not pad to a multiple of four.
- Preview and SVG offer the same A4/compact/extended choices. SVG includes links to Canva, SVG-edit and Inkscape beneath the downloads.
- Compact and extended exports do not change saved layout settings. Enabled custom extras remain included.

### Archived DataVolley setter recovery

- Link an imported DVW to archived rosters with different player IDs. Both home/away setter references on every touch must follow their own team’s ID map, including touches made by the opposite team.
- Existing matches with old setter references must still recover reception-to-first-attack distribution by P1–P6 from lineup context. Compare raw, linked, and legacy-linked calculations.
- Reopen an existing report whose selected sheets omitted all setters: restore both reception bands once, preserve notes and edits, save the recovery, and allow subsequent manual sheet removal.
- Checked seven Fenerbahçe DVWs supplied locally: 371 first attacks, attributed to Alessia Orro (325) and Arelya Karasoy Kocas (46), across both reception bands and all rotations.

### Side-out setter chart order

- In A4, compact and extended exports, show both reception bands on one page per drawn setter: three columns and four rows.
- First two rows: reception #/+ with P4–P3–P2 then P5–P6–P1. Last two rows: reception !/− in the same order, with separate band headings.
- Preserve this court order in the editable sheets and optional secondary-setter charts. Verify native square court proportions and per-court sample labels.

### Optional descriptive players and attack chart grid

- In A4 with selected board extras, disabled secondary-setter graphics must stay disabled: include their text and notes without reintroducing their courts through the extra sheets.
- Enable secondary-setter charts in any format. Each setter must use one 4×3 page, grouped by reception band and ordered P4–P3–P2 / P5–P6–P1.
- Attack charts use at most six players per logical page, in two columns and three rows, with a concise description below each court. Detailed A4 statistics remain in the statistical tables. Select text-only attackers in the format settings; show the full player list ordered by attack attempts, keeping statistics and recorded directions for selected players without their charts.
- Check the saved choices after reopening, and in A4/SVG exports as well as booklet previews. Page counts may increase when many drawings remain enabled.

### Serving-target page

- A4 and booklets use a single six-court grid: P4–P3–P2 / P5–P6–P1, without reception-band subdivisions.
- Keep each recommendation immediately beneath its diagram. If none is available, state that no target is suggested. Preserve square courts and the legend; long manual descriptions retain a visible excerpt and continue in staff notes.

### Component navigator

- Open an existing report: show a vertical component list with the selected component highlighted, and only that component in the editor. Format settings and staff notes are selectable entries.
- Use the direct Matches and sources command; the generic Report actions menu is removed.
- Reorder components with both drag handles and labelled up/down buttons. Reload and verify the saved order; A4, booklet preview, SVG and presentation exports follow it while retaining the rotation grids within each component.
- Add/remove sheets through Manage sheets, then check that navigator entries update and that removing the selected component selects an available one.
- On narrow screens, selecting a component collapses the list and exposes the editor; reopen the list to select another. Check keyboard access, text edits, persistence and horizontal overflow.

## PDF and presentation consistency

- Export A4 PDF, PPTX and ODP from the same report. Both presentation formats
  must use the complete A4 plan: same page count, section order, detailed
  statistics, optional components and coach edits; no A5 booklet padding.
- Convert the presentations locally to PDF and compare reception formations,
  attack directions and both setter reception bands. Check square courts,
  Ubuntu typography, labels, footer and arrowhead sizes (including SVG markers
  using userSpaceOnUse). Text and court shapes must remain editable.

## Staff notes in the web editor

- Select Staff notes in the component navigator. The automatic continuations,
  secondary-setter summary and other notes collected by the full A4 export
  must appear alongside the separate free-notes field. Preview/video URLs
  must not be injected into those paragraphs.
- Edit an automatic note, reload, export and check that the edited text is kept.
  Empty a note to exclude it, then restore its calculated text. Verify the
  corresponding booklet notes also respect the edit.

- If a bundled font fails to load, verify PPTX/ODP still download using the
  fallback font. On an export failure the web alert must include the actual
  error message, rather than only the generic failure notice.
- Reopen an edited automatic staff note, export PPTX and ODP and inspect the
  native text objects to confirm that both formats contain the coach's text.

- Regress Firefox's null marker viewBox: export attack arrows whose marker
  omits viewBox. A null baseVal must use the marker's native coordinates and
  allow both PPTX and ODP to download.
