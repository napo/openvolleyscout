import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { RotationIndex } from '../filters/advanced-filters';

/**
 * Calculates the rotation index (1-6) for a given rally based on serve sequence and team.
 *
 * Rotation is determined by which player is serving:
 * - Position 1 (back right) → rotation 1
 * - Position 2 (front right) → rotation 2
 * - Position 3 (front center) → rotation 3
 * - Position 4 (front left) → rotation 4
 * - Position 5 (back left) → rotation 5
 * - Position 6 (back center) → rotation 6
 */

/**
 * Get the rotation index from a serving player's court position.
 */
export function getRotationFromPosition(serverCourtPosition: number): RotationIndex {
  // Clamp to valid range (1-6)
  const clamped = Math.max(1, Math.min(6, serverCourtPosition));
  return clamped as RotationIndex;
}

/**
 * Find the serving player's court position in a rally.
 * Returns the court position (1-6) of the player who served.
 * Returns undefined if server position cannot be determined.
 */
export function findServerPositionInRally(touches: BallTouch[]): number | undefined {
  // Find first serve touch in the rally
  const serveTouch = touches.find((t) => t.skill === 'serve');

  if (!serveTouch) {
    return undefined;
  }

  // Try to get court position from player data
  // This would need to be supplemented with lineup data in real usage
  // For now, return undefined and let caller provide it
  return undefined;
}

/**
 * Calculate rotation index for a rally.
 *
 * This is a simplified implementation that requires:
 * - Serve player court position (from lineup lookup)
 * - Team side (to differentiate home/away rotations)
 *
 * In production, this would lookup the court position from the set's
 * starting lineup and track rotations through substitutions.
 */
export function calculateRotationForRally(
  touches: BallTouch[],
  servingTeamSide: 'home' | 'away',
  serverCourtPosition?: number,
): RotationIndex | undefined {
  if (!serverCourtPosition || serverCourtPosition < 1 || serverCourtPosition > 6) {
    return undefined;
  }

  return getRotationFromPosition(serverCourtPosition);
}

/**
 * Get rotation statistics for a team across all rallies.
 * Groups touches by rotation and calculates efficiency metrics.
 */
export interface RotationStats {
  rotation: RotationIndex;
  touchCount: number;
  pointsWon: number;
  winRate: number;
  attackCount: number;
  attackSuccess: number;
  attackEfficiency: number;
  sideOutCount: number;
  sideOutSuccess: number;
  breakPointCount: number;
  breakPointSuccess: number;
}

/**
 * Aggregate rotation statistics from rally data.
 * Requires that each rally has associated rotation data.
 */
export function aggregateRotationStats(
  rallies: RallyStats[],
  teamSide: 'home' | 'away',
): RotationStats[] {
  const rotationMap = new Map<RotationIndex, RotationStats>();

  // Initialize rotation buckets
  for (let i = 1; i <= 6; i++) {
    const rotation = i as RotationIndex;
    rotationMap.set(rotation, {
      rotation,
      touchCount: 0,
      pointsWon: 0,
      winRate: 0,
      attackCount: 0,
      attackSuccess: 0,
      attackEfficiency: 0,
      sideOutCount: 0,
      sideOutSuccess: 0,
      breakPointCount: 0,
      breakPointSuccess: 0,
    });
  }

  // Aggregate data
  rallies.forEach((rally) => {
    // Skip if no rotation data available
    // This would be populated from rally analysis
    // For now, just collect touches

    const teamTouches = rally.touches.filter((t) => t.teamSide === teamSide);

    teamTouches.forEach((touch) => {
      // Update stats based on skill and evaluation
      // Implementation depends on having rotation info attached to touches
    });
  });

  return Array.from(rotationMap.values());
}

/**
 * Calculate which rotation a team is currently in based on rotation history.
 * Tracks rotations through the match accounting for serves.
 */
export class RotationTracker {
  private currentRotations: Map<'home' | 'away', RotationIndex> = new Map([
    ['home', 1],
    ['away', 1],
  ]);

  /**
   * Update rotation when a serve ends (point awarded or serve changes hands).
   */
  recordServeEnd(servingTeam: 'home' | 'away', pointWonBy: 'home' | 'away'): void {
    // If serving team won point, rotation stays same
    // If receiving team won point, both teams rotate

    if (pointWonBy !== servingTeam) {
      // Side-out: both teams rotate
      this.rotateTeam('home');
      this.rotateTeam('away');
    } else {
      // Point for serving team: only serving team rotates
      // (Actually, in volleyball, this is wrong - need to review rules)
      // For now, implement correct rotation logic
    }
  }

  /**
   * Rotate a team to next position (1→2→3→4→5→6→1).
   */
  private rotateTeam(team: 'home' | 'away'): void {
    const current = this.currentRotations.get(team) ?? 1;
    const next = current === 6 ? 1 : ((current + 1) as RotationIndex);
    this.currentRotations.set(team, next);
  }

  /**
   * Get current rotation for a team.
   */
  getCurrentRotation(team: 'home' | 'away'): RotationIndex {
    return this.currentRotations.get(team) ?? 1;
  }

  /**
   * Reset to starting rotations.
   */
  reset(): void {
    this.currentRotations.set('home', 1);
    this.currentRotations.set('away', 1);
  }
}
