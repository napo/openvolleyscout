import type { ActiveLineup } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { Player } from '@src/domain/roster/types';
import type { ParsedTouchCode } from './code-parser';

export type CodeSuggestion = {
  code: string;
  label: string;
};

export function getCodeSuggestions(
  partial: string,
  context: {
    lastTouch: BallTouch | null;
    homeLineup: ActiveLineup | null;
    awayLineup: ActiveLineup | null;
    homePlayers?: Player[];
    awayPlayers?: Player[];
  },
): CodeSuggestion[] {
  if (!partial.trim()) return [];

  const trimmedPartial = partial.trim();
  const upperPartial = trimmedPartial.charAt(0).toLowerCase() === 'a'
    ? `a${trimmedPartial.slice(1).toUpperCase()}`
    : trimmedPartial.toUpperCase();

  // Suggest complete codes based on partial input
  const suggestions: CodeSuggestion[] = [];

  // If partial starts with team + jersey, suggest skill codes
  if (/^[*a]\d{1,2}$/.test(upperPartial)) {
    const teamCode = upperPartial[0];
    const team = teamCode === '*' ? 'home' : 'away';
    const skillCodes = ['S', 'R', 'E', 'A', 'B', 'D', 'F', 'C'];
    const skillLabels: Record<string, string> = {
      S: 'serve',
      R: 'receive',
      E: 'set',
      A: 'attack',
      B: 'block',
      D: 'dig',
      F: 'freeball',
      C: 'cover',
    };

    skillCodes.forEach((skill) => {
      suggestions.push({
        code: `${upperPartial}${skill}+`,
        label: `${team} ${skillLabels[skill]}`,
      });
    });

    return suggestions;
  }

  // If we have a partial like *7S, suggest evaluations
  if (/^[*a]\d{1,2}[SREABDFC]$/.test(upperPartial)) {
    const evals = ['#', '+', '!', '-', '/', '='];
    evals.forEach((e) => {
      suggestions.push({
        code: `${upperPartial}${e}`,
        label: `${upperPartial} → ${e}`,
      });
    });
    return suggestions;
  }

  // If we have a complete valid code, suggest next team/player
  if (/^[*a]\d{1,2}[SREABDFC][1-6]{2}?[=/!+\-#]?$/.test(upperPartial)) {
    // Suggest next player from away team by default
    const targetLineup = context.awayLineup;
    const targetPlayers = context.awayPlayers;
    const teamCode = 'a';

    if (targetLineup?.slots && targetPlayers) {
      const playerMap = new Map(targetPlayers.map(p => [p.id, p]));
      const startPlayers = targetLineup.slots.slice(0, 3); // First 3 outfield players
      startPlayers.forEach((slot) => {
        const player = playerMap.get(slot.playerId);
        if (player) {
          const jNum = player.jerseyNumber;
          const playerName = player.displayName || `${player.firstName} ${player.lastName}`.trim() || player.shortName;
          suggestions.push({
            code: `${upperPartial} ${teamCode}${jNum}`,
            label: `${playerName}`,
          });
        }
      });
    }
  }

  return suggestions.slice(0, 5); // Max 5 suggestions
}
