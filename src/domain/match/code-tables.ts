/**
 * DataVolley code tables: attack combinations ([3ATTACKCOMBINATION]) and
 * setter calls ([3SETTERCALL]).
 *
 * In DataVolley the two tables are distinct: a setter call ("K" + 1 char)
 * describes the middle blocker's run and belongs on the set (E) code; an
 * attack combination (2 chars, e.g. X5, V6, C1) describes the attack and
 * belongs on the attack (A) code, where it also implies the ball type and the
 * start zone. Every .dvw file carries both tables, so the original rows are
 * kept verbatim (`rawFields`) and written back unchanged on export.
 */

export interface AttackCombinationDefinition {
  /** Two-character code used in the attack code, e.g. "X5". */
  code: string;
  description?: string;
  /** DataVolley zone the attack starts from (1-9). */
  startZone?: number;
  /** Ball type implied by the combination (H, M, Q, T, U, N, O). */
  ballType?: string;
  /** Served attacker: F(ront), B(ack), C(enter), P(ipe), S(etter) or "-". */
  targetAttacker?: string;
  /** The row as found in the .dvw file, without the trailing separator. */
  rawFields: string[];
}

export interface SetterCallDefinition {
  /** "K" + one character, e.g. "K1". */
  code: string;
  description?: string;
  rawFields: string[];
}

export interface DataVolleyCodeTables {
  attackCombinations: AttackCombinationDefinition[];
  setterCalls: SetterCallDefinition[];
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Setter calls always start with "K"; attack combinations never do. */
export function isSetterCallCode(code: string | undefined | null): boolean {
  return typeof code === 'string' && /^K[A-Z0-9]$/i.test(code.trim());
}

export function parseAttackCombinationFields(fields: readonly string[]): AttackCombinationDefinition | null {
  const code = optional(fields[0])?.toUpperCase();
  if (!code) return null;
  const startZone = Number.parseInt(fields[1] ?? '', 10);

  return {
    code,
    description: optional(fields[4]),
    startZone: Number.isInteger(startZone) && startZone >= 1 && startZone <= 9 ? startZone : undefined,
    ballType: optional(fields[3])?.toUpperCase(),
    targetAttacker: optional(fields[8])?.toUpperCase(),
    rawFields: [...fields],
  };
}

export function parseSetterCallFields(fields: readonly string[]): SetterCallDefinition | null {
  const code = optional(fields[0])?.toUpperCase();
  if (!code) return null;

  return {
    code,
    description: optional(fields[2]) ?? optional(fields[1]),
    rawFields: [...fields],
  };
}

function parseRows<T>(rows: readonly string[], parse: (fields: readonly string[]) => T | null): T[] {
  return rows
    .map((row) => parse(row.replace(/;$/, '').split(';')))
    .filter((definition): definition is T => definition !== null);
}

// The standard DataVolley 4 season tables (as shipped in DataVolley and found
// in Lega Volley files). Used for matches scouted in OpenVolleyScout, which
// have no tables of their own.
const DEFAULT_ATTACK_COMBINATION_ROWS = [
  'C1;3;C;Q;1 TEMPO;;0;4854;C;;',
  'CC;3;L;Q;1 TEMPO C;;0;4851;C;;',
  'CA;3;C;Q;A;;0;4949;C;;',
  'C7;3;R;Q;SEVEN;;0;4837;C;;',
  'C2;3;L;Q;ZERO;;0;4859;C;;',
  'CB;2;L;Q;B;;0;4976;C;;',
  'CF;2;L;Q;FAST;;0;4883;C;;',
  'XA;4;R;H;HIGH BALL 4;;255;4912;F;;',
  'X1;4;R;H;SHORT HIGH BALL 4;;255;4825;F;;',
  'X5;4;R;M;QUICK 4;;16711680;4913;F;;',
  'X9;4;R;M;QUICK 4 INSIDE;;16711680;4828;F;;',
  'X3;3;R;M;CROSS 4;;16711680;4950;F;;',
  'VA;2;L;H;HIGH BALL 2;;255;4988;B;;',
  'V1;2;L;H;SHORT HIGH BALL 2;;255;4979;B;;',
  'V6;2;L;M;QUICK 2;;16711680;4886;B;;',
  'VF;2;L;M;FAST (no MB);;0;4885;B;;',
  'V4;2;L;M;QUICK 2 INSIDE;;16711680;4976;B;;',
  'V3;3;L;M;CROSS 2;;16711680;4950;B;;',
  'WA;9;C;H;HIGH BALL 1;;255;4186;B;1;',
  'WO;9;C;M;QUICK 1;;16711680;4186;B;1;',
  'WW;9;C;M;GAMMA;;16711680;3671;B;1;',
  'WP;8;C;H;HIGH PIPE;;255;4150;P;1;',
  'WQ;8;C;M;PIPE NORMAL;;16711680;4150;P;1;',
  'WD;8;C;M;PIPE 6-1;;16711680;4163;P;1;',
  'WS;8;C;M;PIPE 6-5;;16711680;4138;P;1;',
  'X0;7;C;M;PIPE 5;;16711680;4114;F;1;',
  'V0;7;C;H;HIGH BALL 5;;255;4114;F;1;',
  'PP;3;C;O;SETTER TIP;;65535;4961;S;;',
  'P2;3;C;O;2ND TOUCH;;65535;4949;-;;',
  'CE;3;C;O;EMERGENCY;;65535;4748;-;;',
  'PR;3;C;O;PASSING BALL;;65535;4748;-;;',
];

const DEFAULT_SETTER_CALL_ROWS = [
  'K1;;1 TEMPO;;16711680;3949;4454;4958;;255;',
  'K7;;SEVEN;;16711680;3734;4333;4937;;255;',
  'K2;;ZERO;;16711680;3857;4272;4767;;255;',
  'KF;;FAST;;16711680;4253;3789;4586;;255;',
  'KE;;No First Tempo;;0;0000;0000;0000;5858,5826,6426,6458,6458,;12632256;',
];

export const DEFAULT_DATAVOLLEY_CODE_TABLES: Readonly<DataVolleyCodeTables> = Object.freeze({
  attackCombinations: parseRows(DEFAULT_ATTACK_COMBINATION_ROWS, parseAttackCombinationFields),
  setterCalls: parseRows(DEFAULT_SETTER_CALL_ROWS, parseSetterCallFields),
});

/** The match's own tables, or the standard ones when it has none stored. */
export function getMatchCodeTables(project: { dataVolleyCodeTables?: DataVolleyCodeTables }): DataVolleyCodeTables {
  return project.dataVolleyCodeTables ?? DEFAULT_DATAVOLLEY_CODE_TABLES;
}

export function findAttackCombination(
  tables: DataVolleyCodeTables,
  code: string | undefined | null,
): AttackCombinationDefinition | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();
  return tables.attackCombinations.find((definition) => definition.code === normalized);
}
