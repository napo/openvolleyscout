# Live Scouting Browser QA Checklist

Use this checklist for manual browser validation of the live scouting flow. Run the checklist in a clean browser session when possible, and repeat mobile checks on a real device or responsive device mode.

## Match Setup

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Create a match from the startup flow. | A new match can be created and opened in scouting without validation errors. | [ ] | [ ] |  |
| Configure both team lineups. | Each team accepts exactly six starting players on court. | [ ] | [ ] |  |
| Configure tactical roles for all lineup players. | Required tactical roles are present once each, with no duplicates or missing roles. | [ ] | [ ] |  |
| Enable libero auto-middle replacement. | The set setup stores the auto-middle replacement option for the selected team. | [ ] | [ ] |  |
| Confirm the serving team. | The selected serving team is shown in the set review and live scouting starts with that team serving. | [ ] | [ ] |  |

## Initial Libero State

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Start a set with the receiving team having an eligible back-row middle and auto-middle replacement enabled. | The receiving team's libero appears immediately in place of the eligible middle. | [ ] | [ ] |  |
| Start a set with the serving team's middle in zone 1 and auto-middle replacement enabled. | The serving middle in zone 1 remains on court before the serve. | [ ] | [ ] |  |
| Inspect the libero marker. | The libero marker displays with the libero styling, including a black outline. | [ ] | [ ] |  |
| Inspect the replaced middle's marker. | The replaced player is not visible on court while the libero replacement is active. | [ ] | [ ] |  |

## Serve Flow

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Open the live rally view before recording the serve. | The server is positioned outside the court in the serve start area. | [ ] | [ ] |  |
| Record a non-ace serve that continues play. | The server moves into the configured break-point defense position. | [ ] | [ ] |  |
| Record a serve with `#` evaluation. | The flow enters ace victim selection. | [ ] | [ ] |  |
| Select the ace victim. | A receiving touch with `=` evaluation is recorded for the selected victim. | [ ] | [ ] |  |
| Observe the court after recording serve `#` and before selecting the victim. | Teams do not tactically reposition before ace victim selection is resolved. | [ ] | [ ] |  |

## Reception Flow

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Start a rally with the receiving team visible. | The receiving team starts in its configured reception system. | [ ] | [ ] |  |
| Record a reception or dig by the receiving team. | The setter moves to the release position under the net between zones 2 and 3. | [ ] | [ ] |  |
| Continue the rally until the ball crosses to the opponent. | The setter returns to the configured defense position for the current phase. | [ ] | [ ] |  |

## Libero Flow

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Trigger or confirm libero entry for an eligible back-row middle. | The libero enters for the back-row middle and the replacement relation is visible in the UI. | [ ] | [ ] |  |
| Rotate through points with the libero active. | The libero never appears in front-row positions 2, 3, or 4. | [ ] | [ ] |  |
| Rotate until the replaced player would enter the front row. | A libero exit confirmation is proposed before the illegal front-row state is committed. | [ ] | [ ] |  |
| Confirm the libero exit. | The original replaced player returns to court and the libero leaves court. | [ ] | [ ] |  |
| Let a middle in zone 1 serve, then have that team lose serve by side-out. | A post-side-out libero entry proposal appears once the middle stops serving. | [ ] | [ ] |  |

## Events Panel

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Open the Events panel from live scouting. | The Events panel replaces the court completely. | [ ] | [ ] |  |
| Keep the Events panel open. | The court is not visible behind or beside the panel. | [ ] | [ ] |  |
| Close the Events panel. | The court returns to the live scouting view in its prior state. | [ ] | [ ] |  |

## Popup Behavior

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Tap or click near the current ball location to open the touch popup. | The popup does not cover the ball. | [ ] | [ ] |  |
| Select a player and open the touch popup. | The popup does not cover the selected player marker. | [ ] | [ ] |  |
| Open the popup in mobile landscape. | The popup remains fully visible and usable within the viewport. | [ ] | [ ] |  |

## Rotations

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Award a point to the receiving team. | The receiving team rotates only after winning side-out. | [ ] | [ ] |  |
| Award a point to the serving team. | The serving team keeps the same rotation when it wins the point. | [ ] | [ ] |  |
| Observe court markers after a rotation or tactical phase change. | Court markers animate between positions instead of jumping abruptly. | [ ] | [ ] |  |

## Statistics

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Open set statistics after recording touches for both teams. | Set stats show team-separated player tables. | [ ] | [ ] |  |
| Inspect charts in the stats view. | Charts are separated by team and do not mix team data. | [ ] | [ ] |  |
| Record a serve ace and select an ace victim. | The ace victim receives a reception error. | [ ] | [ ] |  |
| Inspect the serving player's stats after the ace. | The server receives an ace. | [ ] | [ ] |  |
| Inspect the stats view for deprecated quick sections. | No Rally sequence or DataVolley quick stats section appears. | [ ] | [ ] |  |

## Mobile

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Use smartphone portrait size during setup pages. | Setup pages scroll correctly and controls remain reachable. | [ ] | [ ] |  |
| Use smartphone landscape size during live scouting. | The scouting court and controls remain usable. | [ ] | [ ] |  |
| Inspect setup, scouting, Events, popup, and stats views on mobile widths. | No horizontal overflow appears. | [ ] | [ ] |  |

## Vertical Court and Video

| Check | Expected result | Pass | Fail | Notes |
| --- | --- | --- | --- | --- |
| Select Court or Detailed input with a vertical court on a desktop. | Entered data stays left; video is right with the scouting controls below it. | [ ] | [ ] |  |
| Scout without attaching a video. | The video tile shows a crossed-out video illustration and the localized “No video” message; source buttons remain available. | [ ] | [ ] |  |
| Select the server and draw the serve, with either team serving and browser zoom at 90% and 100%. | Instructions stay above the court; the server and service area remain visible and reachable. | [ ] | [ ] |  |
| Attach a video and press Space with focus on a scouting button. | Video pauses/resumes once per press; the focused scouting button does not activate. Space still works normally in text fields. | [ ] | [ ] |  |
| Type DataVolley codes with a video attached and press Ctrl+Space. | Video pauses/resumes; no character is typed. Space still types a space. | [ ] | [ ] |  |
| Change the video shortcut in Settings (e.g. to F2) and repeat. | The new combination works; Ctrl+Space no longer does. Plain or Shift-only keys are rejected. | [ ] | [ ] |  |
| Resize to smartphone landscape. | The video area disappears; a notice says video and webcam are unavailable on small screens. After "Got it" it does not come back. | [ ] | [ ] |  |
| Use Tags input below 1100×600. | No video area; a notice explains Tags needs a wider screen for the video. | [ ] | [ ] |  |
| Show a long point confirmation in Court and Detailed input at 667×375. | Instructions and confirmation buttons appear beside the controls; they do not cover or shrink the service area. The controls column scrolls if needed. | [ ] | [ ] |  |
| Resize between desktop and smartphone with a video loaded. | The same player remains loaded, preserving playback position. | [ ] | [ ] |  |
