# Team library workflow checks

Use an isolated browser profile with several archived teams and at least one
existing roster. Enable tactical reports to check the optional report action.

1. Open Teams. Only the archive should appear. Check its four sortable data
   columns and two rows per team: data followed by icon-and-text actions.
2. Search by name, code and coaching staff. Change sorting and scroll the table.
   Open a team by name or Edit; the archive should be replaced by the editor.
3. Return without edits. Check search, sorting, scroll position and keyboard
   focus restoration. A clean form should not ask to discard changes.
4. Change the team name, coaching staff and existing player details. Add,
   quick-add, remove and generate players. Before Save, archive records and
   saved match names must remain unchanged.
5. Cancel or Back with edits. Reject the confirmation and verify the form is
   preserved; accept it and reopen to check the original data remains intact.
6. Save edits. Verify the archive, roster and linked saved match names update,
   and the list reappears with its search/sort preserved. Invalid team names
   or jersey numbers must keep the editor open and display validation errors.
7. Create a new team, cancel it, and verify no archive record was created.
   Create and save a valid team, then check it appears in the archive.
8. Check Study, optional tactical report, Delete, Import and Export. Cancelling
   deletion must preserve the team; successful deletion must return to the list.
9. At desktop, tablet and 390 px phone widths, verify full-width views, visible
   actions, local table scrolling, no document overflow and usable editor fields.
10. Check keyboard navigation and translated labels. Run TypeScript, the full
    test suite and the production build before committing.

## DataVolley player identity reconciliation

- Import a player whose full normalized name matches an archived player with another jersey number. The preview must require a choice before import, including the duplicate-match overwrite/copy flow.
- Choose the existing identity: retain its archive ID and archive jersey, while the match keeps its recorded jersey. A different historical owner of that jersey must not override the explicit choice.
- Choose a different person: require a role, birth year, or identifying note; create a separate archive ID and retain those details.
- Import again with multiple archived homonyms: show the distinguishing details beside each identity, and allow choosing the intended player without creating another entry.
- Verify unresolved or invalid choices write neither team; queued files must start with fresh choices. Check the form on a narrow screen and in another app language.
