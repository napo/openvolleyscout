import { describe, expect, it } from 'vitest';
import { en } from '@src/i18n/locales/en';
import { it as italian } from '@src/i18n/locales/it';
import { de } from '@src/i18n/locales/de';
import { es } from '@src/i18n/locales/es';
import { ro } from '@src/i18n/locales/ro';
import { sl } from '@src/i18n/locales/sl';
import { ar } from '@src/i18n/locales/ar';
import { tr } from '@src/i18n/locales/tr';
import { ja } from '@src/i18n/locales/ja';
import { zh } from '@src/i18n/locales/zh';
import { IMPORT_MESSAGE_KEYS, translateImportMessage } from './translate';

const translator = (messages: Record<string, string>) => (key: string, params?: Record<string, string | number>) =>
  (messages[key] ?? key).replace(/{{(\w+)}}/g, (_, name) => String(params?.[name] ?? name));

// One sample of every English message the parser, mapper and validator emit.
const SAMPLES = [
  'UTF-8 decoding failed; decoded file as latin1/ISO-8859-1.',
  'Ignoring content before the first DataVolley section.',
  'No [3SCOUT] section found; parsed scout-like rows from the file body.',
  'DataVolley file is missing one or both [3TEAMS] rows; fallback teams were created.',
  'Ignoring player row without a valid jersey number.',
  'No [3SET] section found.',
  'Ignoring action without a home/away team marker.',
  'Ignoring action without a player number.',
  'Unsupported or unknown DataVolley skill code "X".',
  'Action has unsupported or missing evaluation "(missing)".',
  'Ignoring empty scout row.',
  'Unsupported scout row was preserved as a diagnostic and skipped by the mapper.',
  'No playable DataVolley actions were parsed from the file.',
  'Set 2: the away rotation never changed in the file; rebuilt from 12 side-outs.',
  'No games found in the Tiebreak Tech database.',
  'No roster found for home team "Rivals".',
  'Set 1: computed score 25-20 differs from stored score 25-21; using stored score.',
  'Set 1 home lineup has only 5 players; replay may not be possible.',
  'Set 1 away lineup was completed from roster order because DataVolley starters were incomplete.',
  'Setter change references a player that is not in the roster; row was preserved but not replayed.',
  'Substitution references a player that is not in the roster; row was preserved but not replayed.',
  'Substitution could not be applied to the imported on-court lineup; row was preserved but not replayed.',
  'Set 3 summary score 25-23 differs from replayed points 24-23; using replayed score for OVS events.',
  'Set 1: point row repeats the score 10-8 (rally annulled and replayed); its actions were not counted.',
  'Set 1: the score jumps to 12-10 without scouted rallies (e.g. points awarded by the referee); 1 point(s) added without actions.',
  'Point row in set 2 had no rally actions; an empty OVS rally was created.',
  'DataVolley point score 3-2 differs from replayed score 3-1.',
  'Set 4 ended with 2 unscored action(s); they were not converted to OVS touches.',
  'Set 5 was not closed because the replayed score is tied.',
  'Rivals has no players in the file (team name only): imported without lineups, so its player and rotation stats are empty.',
  'Illegal libero attack in set 2, rally 14 is excluded from stats.',
  'Imported event log cannot be replayed (unknown).',
  'Point set 2 does not match active set 1.',
  'Touch set 2 does not match active set 1.',
  'Set 1 does not have six starters for both teams.',
  'Set 1 final score does not match point events.',
  'Stats total touches 10 is lower than imported touch events 12.',
  'A point was awarded outside an active rally.',
  'A rally ended while no rally was active.',
  'A rally was started before the previous rally ended.',
  'A touch was recorded outside an active rally.',
  'Imported match has no set_started events.',
  'Imported match must have players for at least one team.',
  'The imported event log ended with an active rally.',
  'Touch rally number changed inside one active rally.',
  'Touch sequence numbers are not strictly increasing inside a rally.',
];

describe('import message translation', () => {
  const t = translator(italian);
  it('translates every known parser message and fills its parameters', () => {
    for (const message of SAMPLES) {
      const translated = translateImportMessage({ message }, t);
      expect(translated, message).not.toBe(message);
      expect(translated, message).not.toMatch(/{{\w+}}/);
    }
    expect(translateImportMessage({ message: 'Set 2: the away rotation never changed in the file; rebuilt from 12 side-outs.' }, t))
      .toBe('Set 2: la rotazione della squadra ospite non cambiava mai nel file; ricostruita dai cambi palla (totale: 12).');
  });
  it('keeps unknown messages in English', () => {
    expect(translateImportMessage({ message: 'Something new.' }, t)).toBe('Something new.');
  });
  it('has every key in every locale', () => {
    for (const [name, messages] of Object.entries({ en, italian, de, es, ro, sl, ar, tr, ja, zh })) {
      for (const key of IMPORT_MESSAGE_KEYS) expect((messages as Record<string, string>)[key], `${name}:${key}`).toBeTruthy();
    }
  });
});
