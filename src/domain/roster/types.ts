import type { PlayerRole } from '../common/enums';

export interface Player {
  id: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  shortName: string;
  role?: PlayerRole;
  isCaptain?: boolean;
}

export interface Team {
  id: string;
  code: string;
  name: string;
  players: Player[];
  staff?: string[];
}
