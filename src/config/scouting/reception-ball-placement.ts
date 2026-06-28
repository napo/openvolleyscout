import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { ScoutingPoint, ScoutingZone } from '@src/domain/spatial';

export type ReceptionBallPlacementConfig = Partial<Record<SkillEvaluation, string[]>>;

export const RECEPTION_BALL_PLACEMENT: ReceptionBallPlacementConfig = {
  '#': ['3B', '2C'],
  '+': ['3A', '2D', '3C', '3D'],
  '!': ['2A', '2B', '3A', '3D', '9C', '8B', '8D', '7B'],
};

const LEAVE_BALL_EVALUATIONS: SkillEvaluation[] = ['-', '='];

function getDisplaySideForTeam(teamSide: TeamSide, courtZones: ScoutingZone[]): TeamSide {
  const teamZone = courtZones.find((z) => z.kind === 'in_court' && z.teamSide === teamSide);
  if (!teamZone) return teamSide;
  return teamZone.center.x < 50 ? 'away' : 'home';
}

export function getReceptionBallTarget(
  evaluation: SkillEvaluation,
  receivingTeam: TeamSide,
  courtZones: ScoutingZone[],
): ScoutingPoint | null {
  if (LEAVE_BALL_EVALUATIONS.includes(evaluation)) {
    return null;
  }

  const targetCodes = RECEPTION_BALL_PLACEMENT[evaluation];
  if (!targetCodes || targetCodes.length === 0) {
    return null;
  }

  const displaySide = getDisplaySideForTeam(receivingTeam, courtZones);
  const targetCode = targetCodes[0];
  return resolveZoneSubzoneToCourtPoint(targetCode, receivingTeam, displaySide, courtZones);
}

function resolveZoneSubzoneToCourtPoint(
  code: string,
  teamSide: TeamSide,
  displaySide: TeamSide,
  courtZones: ScoutingZone[],
): ScoutingPoint | null {
  const gridCoord = dvZoneSubzoneToGrid(code, displaySide);
  if (!gridCoord) {
    return null;
  }

  const zone = courtZones.find((z) => (
    z.kind === 'in_court'
    && z.teamSide === teamSide
    && z.gridCoordinate.row === gridCoord.row
    && z.gridCoordinate.column === gridCoord.column
  ));

  return zone?.center ?? null;
}

function dvZoneSubzoneToGrid(
  code: string,
  teamSide: TeamSide,
): { row: number; column: number } | null {
  if (code.length !== 2) return null;

  const zoneDigit = code[0];
  const subzone = code[1].toUpperCase();

  const zoneToNetSide: Record<string, { netGroup: number; sideGroup: number }> = {
    '4': { netGroup: 1, sideGroup: 1 },
    '3': { netGroup: 1, sideGroup: 2 },
    '2': { netGroup: 1, sideGroup: 3 },
    '7': { netGroup: 2, sideGroup: 1 },
    '8': { netGroup: 2, sideGroup: 2 },
    '9': { netGroup: 2, sideGroup: 3 },
    '5': { netGroup: 3, sideGroup: 1 },
    '6': { netGroup: 3, sideGroup: 2 },
    '1': { netGroup: 3, sideGroup: 3 },
  };

  const mapping = zoneToNetSide[zoneDigit];
  if (!mapping) return null;

  const isNetSide = subzone === 'C' || subzone === 'B';
  const isDvLeft = subzone === 'C' || subzone === 'D';

  if (teamSide === 'away') {
    const baseCol = mapping.netGroup === 1 ? 5 : mapping.netGroup === 2 ? 3 : 1;
    const baseRow = mapping.sideGroup === 1 ? 1 : mapping.sideGroup === 2 ? 3 : 5;
    const column = isNetSide ? baseCol + 1 : baseCol;
    const row = isDvLeft ? baseRow : baseRow + 1;
    return { row, column };
  }

  const baseCol = mapping.netGroup === 1 ? 1 : mapping.netGroup === 2 ? 3 : 5;
  const baseRow = mapping.sideGroup === 1 ? 5 : mapping.sideGroup === 2 ? 3 : 1;
  const column = isNetSide ? baseCol : baseCol + 1;
  const row = isDvLeft ? baseRow + 1 : baseRow;
  return { row, column };
}
