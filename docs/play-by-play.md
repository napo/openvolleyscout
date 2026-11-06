# Play-by-play

The Play-by-play tab appears next to the match report in Data Study and in the
set-end and match-end statistics panels. It follows DataVolley's point-by-point
analysis (local manual, section 9.7.3), while using OVS branding and data models.

Choose a reference team. Its recorded decisive contacts appear by default; the
Show other team button enables the opposing team's contacts. Scores, serving
side, timeout and correction annotations always preserve the complete timeline.
Choose one set or all sets. PDF export uses the same selection and visibility.
The web view shows full player names; PDF rows use surnames where available.

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
- The central lead bar uses home score minus away score after each point or
  correction, with one scale throughout a set. Zero is a tie. A timeout repeats
  the current score and never adds a point.
- Penalties and manual score/rotation/serve corrections are separate timeline
  rows, not ordinary rallies or break points. Point counts exclude these rows;
  action counts show recorded contacts for completed rallies.
- Completed-set scores are checked against the reconstructed chronology. A
  mismatch is warned about; missing rallies are never padded or manufactured.

PDFs use A4, shared branding/fonts and vector lead bars. Every set starts a new
page; long sets continue with repeated set context and column headers. Row
boundaries are retained, and the footer explains symbols without relying on
color. There is no minimum sample requirement for an exact event chronology;
low-sample percentages are not estimated here.

## Verification

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Model tests cover
normalization, side-out rotations, corrected/duplicate points, penalties,
missing data, visibility and PDF table structure. In an isolated browser,
import a complete DVW and compare every set result and point count; test both
reference teams, the opposing-team button, set selection and export. Render all
PDF pages, including a very long set and Arabic/Japanese samples. Check tablet
and phone layouts for local table scrolling and accessible controls. Verify
that the original match report and both end-stage tab panels still work.
