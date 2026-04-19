/**
 * Team Archive and Match Roster System
 * 
 * This file documents the new architecture for managing team archives,
 * rosters, and match-specific player selections in OpenVolleyScout.
 */

/**
 * === ARCHITECTURE OVERVIEW ===
 * 
 * The system distinguishes three core concepts:
 * 
 * 1. ARCHIVED TEAM (ArchivedTeam)
 *    - A team record saved in the local database
 *    - Contains: id, name, staff (head coach, assistant coach)
 *    - Immutable team metadata that persists across matches
 * 
 * 2. ARCHIVED ROSTER (ArchivedRoster)
 *    - A complete roster of all known players for a team across time
 *    - Contains: id, teamId, players (array of ArchivedPlayer)
 *    - Each team can have multiple historical rosters
 *    - Players are stored with full metadata (jersey, name, code, flags)
 * 
 * 3. MATCH ROSTER (Match context)
 *    - Subset of players selected for the current match report
 *    - Selection is ephemeral (not stored in archive)
 *    - Each player has an isSelectedForMatch flag
 *    - Allows reusing archived teams without modifying archive data
 * 
 * 4. MATCH PLAYER (MatchPlayer)
 *    - Player record with match selection context
 *    - Extends ArchivedPlayer with isSelectedForMatch flag
 *    - Used during match setup for roster selection UI
 * 
 * 
 * === WORKFLOW ===
 * 
 * Step 1: Team Name Input with Suggestions
 *   - User searches for team name: "Juventus Volley"
 *   - System queries archived teams (case-insensitive matching)
 *   - If found: show suggestion with "Existing team" label
 *   - If not found: allow creating new team
 * 
 * Step 2: Load or Create Team
 *   - If selecting existing team:
 *     * Load latest roster from archive (getLatestRosterForTeam)
 *     * Convert ArchivedPlayer[] to MatchPlayer[] (all unselected initially)
 *     * Show roster table for player selection
 *   - If creating new team:
 *     * Create empty ArchivedTeam record
 *     * Manual player entry through roster table
 * 
 * Step 3: Match Roster Selection
 *   - User sees roster table with all archived players
 *   - Checkboxes control:
 *     * Select for this match (isSelectedForMatch)
 *     * Mark as libero (isLibero)
 *     * Mark as captain (isCaptain)
 *   - Real-time stats display (selected count, regulars, liberos)
 * 
 * Step 4: Validation
 *   - Volleyball roster rules enforced:
 *     * Max 14 players total
 *     * Up to 12 regular, up to 2 liberos
 *     * If >12, exactly 2 liberos required
 *     * With 2 liberos: min 8 total
 *     * With 1 libero: min 7 total
 *   - captainCount max 1
 * 
 * Step 5: Save Match
 *   - Match project stores:
 *     * Match metadata (date, venue, competition)
 *     * Selected players from both teams
 *     * But NOT the full archived roster (reference only)
 *   - Archived team/roster remains unchanged
 * 
 * 
 * === DATA FLOW ===
 * 
 * 1. Persistence Layer
 *    src/infrastructure/db/match-project-db.ts
 *      - Dexie database v2 (upgraded from v1)
 *      - Tables: matchProjects, archivedTeams, archivedRosters
 * 
 *    src/infrastructure/storage/archived-team-storage.ts
 *      - saveArchivedTeam(team) -> saves to DB
 *      - getArchivedTeamById(id) -> retrieves team
 *      - findArchivedTeamsByName(searchText) -> case-insensitive search
 *      - getLatestRosterForTeam(teamId) -> retrieves latest roster
 *      - getHistoricalRostersForTeam(teamId) -> all rosters for team
 * 
 * 2. React Hooks
 *    src/features/startup/hooks/useTeamSuggestions.ts
 *      - useTeamSuggestions(searchText) -> returns filtered suggestions
 *      - useAllArchivedTeams() -> returns all archived teams
 *      - Both query the storage layer asynchronously
 * 
 * 3. UI Components
 *    src/features/startup/components/TeamNameInput.tsx
 *      - Combobox with team name suggestions
 *      - Shows "Existing team" or "New team" label
 *      - Debounced search as user types
 * 
 *    src/features/startup/components/MatchRosterTable.tsx
 *      - Table display of players from archive
 *      - Columns: Select, Jersey#, Name, Code, Libero, Captain
 *      - Real-time stats panel above table
 *      - Checkboxes control selection/flags
 * 
 * 4. Validation
 *    src/lib/validation/roster-validation.ts
 *      - validateTotalPlayers(selectedPlayers)
 *      - validateLiberoCount(selectedPlayers)
 *      - validateMinimumPlayers(selectedPlayers)
 *      - validateCaptainSelection(selectedPlayers)
 *      - validateMatchRoster(selectedPlayers) -> comprehensive check
 *      - getRosterStats(selectedPlayers) -> calculate summary stats
 * 
 * 5. Domain Models
 *    src/domain/team/types.ts
 *      - ArchivedTeam, ArchivedRoster, ArchivedPlayer
 *      - MatchPlayer, MatchRoster
 *    
 *    src/domain/team/factories.ts
 *      - createArchivedPlayer(...)
 *      - generatePlayerCode(firstName, lastName)
 *      - createEmptyArchivedRoster(teamId)
 *      - createEmptyArchivedTeam(name, staff)
 *      - toMatchPlayer(archivedPlayer, isSelectedForMatch)
 *      - createMatchPlayersFromArchived(archivedPlayers)
 * 
 * 
 * === CODING STANDARDS ===
 * 
 * All source code identifiers are in English:
 *   ✓ archivedTeam, archivedRoster, matchRoster, isSelectedForMatch
 * 
 * All user-facing text is translatable:
 *   - Keys defined in src/i18n/locales/en.ts and it.ts
 *   - All UI strings use t('keyName')
 * 
 * Files follow domain-driven design:
 *   - domain/team/* -> team-specific domain logic
 *   - domain/match/* -> match-specific domain logic
 *   - infrastructure/db/* -> database schema
 *   - infrastructure/storage/* -> persistence operations
 *   - lib/validation/* -> cross-cutting validation rules
 *   - features/startup/components/* -> UI components
 *   - features/startup/hooks/* -> React hooks
 * 
 * 
 * === NEXT STEPS AFTER IMPLEMENTATION ===
 * 
 * 1. Update MatchSetupPage.tsx to use:
 *    - TeamNameInput component for team selection
 *    - MatchRosterTable component for roster selection
 *    - Validation logic from roster-validation.ts
 *    - New match roster data structure
 * 
 * 2. Integrate archived teams into match persistence:
 *    - Store reference to selected players in match project
 *    - Ensure archived data is never corrupted
 *    - Handle edge case of deleted archived team
 * 
 * 3. Add UI for managing archived teams:
 *    - View all archived teams
 *    - Edit team details (name, staff)
 *    - Delete archived team (with confirmation)
 *    - Export/import teams
 * 
 * 4. Enhance match project loading:
 *    - Show which team was used (archived or new)
 *    - Allow re-selecting rosters for editing
 *    - Validate roster hasn't changed since match creation
 * 
 * 5. Add player management features:
 *    - Player history across teams
 *    - Favorite players quick-add
 *    - Player statistics tracking
 * 
 * 6. Consider performance optimizations:
 *    - Cache frequently used teams
 *    - Pagination for large rosters (50+ players)
 *    - Full-text search for players
 * 
 */
