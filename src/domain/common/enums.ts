export type TeamSide = 'home' | 'away';

export type MatchPhase = 'startup' | 'collection' | 'analysis' | 'closed';

export type PlayerRole = 'setter' | 'outside_hitter' | 'middle_blocker' | 'opposite' | 'libero' | 'defensive_specialist';

export type SkillType =
  | 'serve'
  | 'receive'
  | 'set'
  | 'attack'
  | 'block'
  | 'dig'
  | 'freeball'
  | 'cover'
  | 'point'
  | 'substitution'
  | 'timeout';

export type SkillEvaluation = '=' | '/' | '!' | '-' | '+' | '#';

export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6;

export type MatchFormat = 'best_of_3' | 'best_of_5' | 'best_of_7';
