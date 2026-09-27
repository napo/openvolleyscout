import type { TranslationKey } from '@src/i18n';

/**
 * Label for why a rally ended, used when asking to confirm a point.
 * Reasons come from the quick scouting flow ('serve_error', 'attack_kill', …)
 * and from scoring rules (`${skill}_${evaluation}`, 'ace').
 */
export function getRallyEndReasonKey(reason: string): TranslationKey | null {
  switch (reason) {
    case 'serve_error':
    case 'serve_=':
      return 'rallyReasonServeError';
    case 'ace':
    case 'serve_#':
      return 'rallyReasonAce';
    case 'attack_kill':
    case 'attack_#':
      return 'rallyReasonAttackKill';
    case 'attack_error':
    case 'attack_=':
      return 'rallyReasonAttackError';
    case 'attack_blocked':
    case 'attack_/':
    case 'block_#':
      return 'rallyReasonBlockPoint';
    case 'receive_=':
      return 'rallyReasonReceptionError';
    case 'block_=':
    case 'block_/':
      return 'rallyReasonBlockError';
    case 'set_=':
      return 'rallyReasonSetError';
    case 'dig_=':
      return 'rallyReasonDigError';
    case 'freeball_=':
    case 'cover_=':
      return 'rallyReasonOtherError';
    default:
      return null;
  }
}
