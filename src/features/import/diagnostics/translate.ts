/**
 * Import diagnostics are produced in English (logs, tests, exports). The UI
 * shows them in the user's language by matching each known English message
 * and translating it with its parameters; unknown messages stay as they are.
 */
import type { ParsedImportWarning } from './types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface MessagePattern {
  key: string;
  pattern: RegExp;
  params?: readonly string[];
  /** Parameters holding "home"/"away", translated with the side words. */
  sides?: readonly string[];
}

const SCORE = String.raw`(\d+-\d+)`;

const PATTERNS: readonly MessagePattern[] = [
  { key: 'importMsg_utf8Fallback', pattern: /^UTF-8 decoding failed; decoded file as latin1\/ISO-8859-1\.$/ },
  { key: 'importMsg_contentBeforeSection', pattern: /^Ignoring content before the first DataVolley section\.$/ },
  { key: 'importMsg_noScoutSection', pattern: /^No \[3SCOUT\] section found; parsed scout-like rows from the file body\.$/ },
  { key: 'importMsg_missingTeams', pattern: /^DataVolley file is missing one or both \[3TEAMS\] rows; fallback teams were created\.$/ },
  { key: 'importMsg_playerWithoutJersey', pattern: /^Ignoring player row without a valid jersey number\.$/ },
  { key: 'importMsg_noSection', pattern: /^No \[(.+)\] section found\.$/, params: ['section'] },
  { key: 'importMsg_actionWithoutTeam', pattern: /^Ignoring action without a home\/away team marker\.$/ },
  { key: 'importMsg_actionWithoutPlayer', pattern: /^Ignoring action without a player number\.$/ },
  { key: 'importMsg_unknownSkill', pattern: /^Unsupported or unknown DataVolley skill code "(.*)"\.$/, params: ['code'] },
  { key: 'importMsg_unknownEvaluation', pattern: /^Action has unsupported or missing evaluation "(.*)"\.$/, params: ['code'] },
  { key: 'importMsg_emptyRow', pattern: /^Ignoring empty scout row\.$/ },
  { key: 'importMsg_unsupportedRow', pattern: /^Unsupported scout row was preserved as a diagnostic and skipped by the mapper\.$/ },
  { key: 'importMsg_noActions', pattern: /^No playable DataVolley actions were parsed from the file\.$/ },
  { key: 'importMsg_staticRotation', pattern: /^Set (\d+): the (home|away) rotation never changed in the file; rebuilt from (\d+) side-outs\.$/, params: ['set', 'side', 'count'], sides: ['side'] },
  { key: 'importMsg_tiebreakNoGames', pattern: /^No games found in the Tiebreak Tech database\.$/ },
  { key: 'importMsg_tiebreakNoRoster', pattern: /^No roster found for (home|away) team "(.*)"\.$/, params: ['side', 'team'], sides: ['side'] },
  { key: 'importMsg_tiebreakScore', pattern: new RegExp(String.raw`^Set (\d+): computed score ${SCORE} differs from stored score ${SCORE}; using stored score\.$`), params: ['set', 'computed', 'stored'] },
  { key: 'importMsg_shortLineup', pattern: /^Set (\d+) (home|away) lineup has only (\d+) players; replay may not be possible\.$/, params: ['set', 'side', 'count'], sides: ['side'] },
  { key: 'importMsg_lineupCompleted', pattern: /^Set (\d+) (home|away) lineup was completed from roster order because DataVolley starters were incomplete\.$/, params: ['set', 'side'], sides: ['side'] },
  { key: 'importMsg_setterNotInRoster', pattern: /^Setter change references a player that is not in the roster; row was preserved but not replayed\.$/ },
  { key: 'importMsg_substitutionNotInRoster', pattern: /^Substitution references a player that is not in the roster; row was preserved but not replayed\.$/ },
  { key: 'importMsg_substitutionNotApplied', pattern: /^Substitution could not be applied to the imported on-court lineup; row was preserved but not replayed\.$/ },
  { key: 'importMsg_summaryScore', pattern: new RegExp(String.raw`^Set (\d+) summary score ${SCORE} differs from replayed points ${SCORE}; using replayed score for OVS events\.$`), params: ['set', 'summary', 'replayed'] },
  { key: 'importMsg_repeatedScore', pattern: new RegExp(String.raw`^Set (\d+): point row repeats the score ${SCORE} \(rally annulled and replayed\); its actions were not counted\.$`), params: ['set', 'score'] },
  { key: 'importMsg_scoreJump', pattern: new RegExp(String.raw`^Set (\d+): the score jumps to ${SCORE} without scouted rallies \(e\.g\. points awarded by the referee\); (\d+) point\(s\) added without actions\.$`), params: ['set', 'score', 'count'] },
  { key: 'importMsg_emptyRally', pattern: /^Point row in set (\d+) had no rally actions; an empty OVS rally was created\.$/, params: ['set'] },
  { key: 'importMsg_pointScore', pattern: new RegExp(String.raw`^DataVolley point score ${SCORE} differs from replayed score ${SCORE}\.$`), params: ['file', 'replayed'] },
  { key: 'importMsg_unscoredActions', pattern: /^Set (\d+) ended with (\d+) unscored action\(s\); they were not converted to OVS touches\.$/, params: ['set', 'count'] },
  { key: 'importMsg_setTied', pattern: /^Set (\d+) was not closed because the replayed score is tied\.$/, params: ['set'] },
  { key: 'importMsg_teamWithoutPlayers', pattern: /^(.+) has no players in the file \(team name only\): imported without lineups, so its player and rotation stats are empty\.$/, params: ['team'] },
  { key: 'importMsg_illegalLibero', pattern: /^Illegal libero (\w+) in set (\d+), rally (\d+) is excluded from stats\.$/, params: ['skill', 'set', 'rally'] },
  { key: 'importMsg_notReplayable', pattern: /^Imported event log cannot be replayed \((.*)\)\.?$/, params: ['reason'] },
  { key: 'importMsg_pointSetMismatch', pattern: /^Point set (\d+) does not match active set (\d+)\.$/, params: ['set', 'active'] },
  { key: 'importMsg_touchSetMismatch', pattern: /^Touch set (\d+) does not match active set (\d+)\.$/, params: ['set', 'active'] },
  { key: 'importMsg_noSixStarters', pattern: /^Set (\d+) does not have six starters for both teams\.$/, params: ['set'] },
  { key: 'importMsg_finalScoreMismatch', pattern: /^Set (\d+) final score does not match point events\.$/, params: ['set'] },
  { key: 'importMsg_statsTouches', pattern: /^Stats total touches (\d+) is lower than imported touch events (\d+)\.$/, params: ['stats', 'events'] },
  { key: 'importMsg_pointOutsideRally', pattern: /^A point was awarded outside an active rally\.$/ },
  { key: 'importMsg_rallyEndWithoutRally', pattern: /^A rally ended while no rally was active\.$/ },
  { key: 'importMsg_rallyBeforeEnd', pattern: /^A rally was started before the previous rally ended\.$/ },
  { key: 'importMsg_touchOutsideRally', pattern: /^A touch was recorded outside an active rally\.$/ },
  { key: 'importMsg_noSetStarted', pattern: /^Imported match has no set_started events\.$/ },
  { key: 'importMsg_noPlayers', pattern: /^Imported match must have players for at least one team\.$/ },
  { key: 'importMsg_activeRallyAtEnd', pattern: /^The imported event log ended with an active rally\.$/ },
  { key: 'importMsg_rallyNumberChanged', pattern: /^Touch rally number changed inside one active rally\.$/ },
  { key: 'importMsg_sequenceNotIncreasing', pattern: /^Touch sequence numbers are not strictly increasing inside a rally\.$/ },
];

/** The warning's message in the UI language; the English text when it is not a known message. */
export function translateImportMessage(warning: Pick<ParsedImportWarning, 'message'>, t: Translate): string {
  for (const entry of PATTERNS) {
    const match = entry.pattern.exec(warning.message);
    if (!match) continue;
    const params: Record<string, string> = {};
    (entry.params ?? []).forEach((name, index) => {
      const value = match[index + 1] ?? '';
      params[name] = entry.sides?.includes(name) ? t(value === 'home' ? 'importMsg_sideHome' : 'importMsg_sideAway') : value;
    });
    const translated = t(entry.key, params);
    return translated === entry.key ? warning.message : translated;
  }
  return warning.message;
}

/** Every key used above, for the locale completeness test. */
export const IMPORT_MESSAGE_KEYS: readonly string[] = [...PATTERNS.map((entry) => entry.key), 'importMsg_sideHome', 'importMsg_sideAway'];
