# Play-by-play

The Play-by-play tab appears in team Data Study (`/team-analysis`), single-match
analysis (`/analysis`) and the set-end and match-end statistics panels. Team
Data Study provides a match selector over the selected matches, preserving each
match's own chronology and defaulting to the studied team's home/away side. It follows DataVolley's point-by-point
analysis (local manual, section 9.7.3), while using OVS branding and data models.

Two buttons show the team names. Select either button to switch to that team's
recorded decisive contacts; only one team's contacts are shown at a time. Scores, serving
side, timeout and correction annotations always preserve the complete timeline.
Choose one set or all sets. PDF export uses the same selection and visibility.
Web labels use full names where space permits; PDF labels use surnames. The
expandable text list and SVG titles retain complete descriptions.

## Read model and terminology

- `buildMatchStats` supplies normalized rallies and contacts. Duplicate point
  records use the canonical latest award for a rally; contact-only legacy
  imports can supply points through the existing terminal-contact rules.
- A point's cause is attributed only to a recorded, outcome-consistent decisive
  contact. Inferred contacts and synthetic ace-reception links do not identify
  people. A recorded blocked attack remains distinguishable from an error.
- A point without a recorded cause is labelled as detail unavailable. An
  opponent-error label requires an actual recorded error, never just a point.
- BP uses the existing rally-phase classifier: the serving side won the rally.
  Serving side follows set starts, recorded serves, point awards and explicit
  serve corrections. The server comes from a recorded serve or a known lineup.
- P denotes the setter's court position before the point. Imported per-contact
  setter positions take precedence; otherwise known lineups are maintained
  through the existing rotation, substitution and libero helpers. Missing
  positions remain unknown instead of defaulting to P1.
- The chart follows the reference's continuous stepped band, with one tile per
  point of score difference. It extends towards the leading team. The selected
  team is always on the left, including in scores; selecting the other team
  mirrors score order, geometry and point-winner colors together. The unit scale
  stays constant throughout a set, including continuation pages. Timeouts
  interrupt the band without adding a point.
- Winning-point scores sit on the corresponding team's side. The serving jersey
  sits beside the band on the serving team's side. Rotation changes have dashed
  guides, winning contacts are bold and errors use red, with text/symbols still
  conveying the result in monochrome.
- The same pure SVG renderer serves the web and PDF. The expandable text list
  retains full labels when a chart label is shortened for space.
- Penalties and manual score/rotation/serve corrections are separate timeline
  rows, not ordinary rallies or break points. Point counts exclude these rows;
  action counts show recorded contacts for completed rallies.
- Completed-set scores are checked against the reconstructed chronology. A
  mismatch is warned about; missing rallies are never padded or manufactured.

PDFs use A4, shared branding/fonts and vector score bands. Every set starts a new
page; long sets continue with repeated set context and column headers. Fixed row
boundaries are retained, and the footer explains symbols without relying on
color. There is no minimum sample requirement for an exact event chronology;
low-sample percentages are not estimated here.

## Verification

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Model tests cover
normalization, side-out rotations, corrected/duplicate points, penalties,
missing data, mirrored tile geometry, visibility and vector-page boundaries. In an isolated browser,
import a complete DVW and compare every set result and point count; test both
team buttons, set selection and export. Render all
PDF pages, including a very long set and Arabic/Japanese samples. Check tablet
and phone layouts for local table scrolling and accessible controls. Enter
team Data Study from an archived team's Study action, select a subset of its
matches, and open Play-by-play. Check the match selector only lists that subset,
PDFs use the chosen match, and the studied team is preselected both at home and
away. Repeat with a single selected match. Verify
that the original match report and both end-stage tab panels still work.
