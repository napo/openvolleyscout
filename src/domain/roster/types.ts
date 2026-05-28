import type { PlayerRole } from '../common/enums';

export interface Player {
  id: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  shortName: string;
  displayName?: string;
  playerCode: string;
  role?: PlayerRole;
  isCaptain?: boolean;
  isLibero?: boolean;
}

export interface TeamStaff {
  headCoach: string;
  assistantCoach: string;
}

export interface Team {
  id: string;
  code: string;
  name: string;
  players: Player[];
  staff: TeamStaff;
}
