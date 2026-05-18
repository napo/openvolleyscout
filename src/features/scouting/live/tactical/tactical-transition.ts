import type { TeamSide } from '@src/domain/common/enums';
import type { DefenseContext } from '@src/domain/systems';
import type { BallTouch } from '@src/domain/touch/types';

export type TeamTacticalPhase =
  | 'serving_prepare'
  | 'break_point_defense'
  | 'break_point_setter_release'
  | 'reception'
  | 'after_reception_setter_release'
  | 'side_out_defense'
  | 'side_out_setter_release';

export type TeamTacticalPhases = Record<TeamSide, TeamTacticalPhase>;

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function getDefenseContextForTacticalPhase(phase: TeamTacticalPhase): DefenseContext {
  return phase === 'side_out_defense'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
    ? 'side_out'
    : 'break_point';
}

export function usesReceptionLayout(phase: TeamTacticalPhase): boolean {
  return phase === 'reception';
}

export function getInitialTeamTacticalPhases(servingTeam: TeamSide | null | undefined): TeamTacticalPhases {
  if (!servingTeam) {
    return {
      away: 'reception',
      home: 'reception',
    };
  }

  return {
    [servingTeam]: 'serving_prepare',
    [getOppositeTeamSide(servingTeam)]: 'reception',
  } as TeamTacticalPhases;
}

export function getSetterReleasePhaseAfterTouch(phase: TeamTacticalPhase, touch: BallTouch): TeamTacticalPhase | null {
  if (touch.evaluation === '=') {
    return null;
  }

  if (phase === 'reception' && touch.skill === 'receive') {
    return 'after_reception_setter_release';
  }

  if (touch.skill !== 'dig') {
    return null;
  }

  if (phase === 'break_point_defense' || phase === 'break_point_setter_release') {
    return 'break_point_setter_release';
  }

  if (
    phase === 'side_out_defense'
    || phase === 'side_out_setter_release'
    || phase === 'after_reception_setter_release'
  ) {
    return 'side_out_setter_release';
  }

  return null;
}

function isTerminalServe(touch: BallTouch): boolean {
  return touch.skill === 'serve' && (touch.evaluation === '#' || touch.evaluation === '=');
}

function isAceVictimReception(touch: BallTouch, previousTouch?: BallTouch | null): boolean {
  return (
    touch.skill === 'receive'
    && touch.evaluation === '='
    && previousTouch?.skill === 'serve'
    && previousTouch.evaluation === '#'
    && previousTouch.teamSide !== touch.teamSide
  );
}

function shouldSwitchToSideOutDefenseAfterTouch(phase: TeamTacticalPhase, touch: BallTouch): boolean {
  return (
    phase === 'reception'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
  ) && touch.skill === 'attack';
}

function getDefensePhaseAfterOpponentTouch(phase: TeamTacticalPhase): TeamTacticalPhase | null {
  if (phase === 'break_point_setter_release') {
    return 'break_point_defense';
  }

  if (
    phase === 'reception'
    || phase === 'after_reception_setter_release'
    || phase === 'side_out_setter_release'
  ) {
    return 'side_out_defense';
  }

  return null;
}

export function getNextTeamTacticalPhasesAfterTouch({
  phases,
  touch,
  previousTouch,
  servingTeam,
}: {
  phases: TeamTacticalPhases;
  touch: BallTouch;
  previousTouch?: BallTouch | null;
  servingTeam?: TeamSide | null;
}): TeamTacticalPhases {
  const nextPhases: TeamTacticalPhases = { ...phases };

  if (isTerminalServe(touch) || isAceVictimReception(touch, previousTouch)) {
    return nextPhases;
  }

  if (touch.skill === 'serve' && (!previousTouch || touch.teamSide === servingTeam)) {
    nextPhases[touch.teamSide] = 'break_point_defense';
  }

  const setterReleasePhase = getSetterReleasePhaseAfterTouch(nextPhases[touch.teamSide], touch);
  if (setterReleasePhase) {
    nextPhases[touch.teamSide] = setterReleasePhase;
  }

  if (shouldSwitchToSideOutDefenseAfterTouch(nextPhases[touch.teamSide], touch)) {
    nextPhases[touch.teamSide] = 'side_out_defense';
  }

  if (previousTouch && previousTouch.teamSide !== touch.teamSide) {
    const previousTeamDefensePhase = getDefensePhaseAfterOpponentTouch(nextPhases[previousTouch.teamSide]);

    if (previousTeamDefensePhase) {
      nextPhases[previousTouch.teamSide] = previousTeamDefensePhase;
    }
  }

  return nextPhases;
}

export function getTeamTacticalPhasesAfterTouches({
  servingTeam,
  touches,
}: {
  servingTeam?: TeamSide | null;
  touches: readonly BallTouch[];
}): TeamTacticalPhases {
  return touches.reduce<TeamTacticalPhases>((phases, touch, index) => getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch,
    previousTouch: touches[index - 1],
    servingTeam,
  }), getInitialTeamTacticalPhases(servingTeam));
}

export function getTeamTacticalPhase({
  teamSide,
  phases,
  servingTeam,
}: {
  teamSide: TeamSide;
  phases?: TeamTacticalPhases | null;
  servingTeam?: TeamSide | null;
}): TeamTacticalPhase {
  return phases?.[teamSide] ?? getInitialTeamTacticalPhases(servingTeam)[teamSide];
}

export function getTeamPhaseFromCurrentRally({
  teamSide,
  servingTeam,
  touches,
}: {
  teamSide: TeamSide;
  servingTeam?: TeamSide | null;
  touches: readonly BallTouch[];
}): TeamTacticalPhase {
  return getTeamTacticalPhasesAfterTouches({ servingTeam, touches })[teamSide];
}
