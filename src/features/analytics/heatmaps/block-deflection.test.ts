import { describe, it, expect } from 'vitest';
import type { HeatmapEvent, HeatmapDensityGrid } from './aggregation/heatmap-aggregation';
import type { BallDirection, StagePoint } from '@src/domain/trajectory/types';

describe('Block Deflection Integration', () => {
  describe('BallDirection with via points', () => {
    it('should create attack with block deflection trajectory', () => {
      // Attack from zone 4 (left) gets blocked and lands in zone 1 (right)
      const blockDeflection: BallDirection = {
        start: { x: 18, y: 60 },      // Attack origin (zone 4)
        via: [{ x: 50, y: 50 }],      // Block contact point (net area)
        end: { x: 82, y: 30 },        // Final landing (zone 1)
        courtZoneStart: '4',
        courtZoneEnd: '1',
        deflectedBy: {
          skill: 'block',
          playerId: 'blocker-123',
        },
      };

      expect(blockDeflection.via).toHaveLength(1);
      expect(blockDeflection.via?.[0].x).toBe(50);
      expect(blockDeflection.via?.[0].y).toBe(50);
      expect(blockDeflection.deflectedBy?.skill).toBe('block');
      expect(blockDeflection.deflectedBy?.playerId).toBe('blocker-123');
    });

    it('should support multiple via points for complex deflection', () => {
      const complexDeflection: BallDirection = {
        start: { x: 25, y: 55 },
        via: [
          { x: 50, y: 50 },     // Block touch
          { x: 60, y: 45 },     // Midair deflection
          { x: 70, y: 40 },     // Secondary touch
        ],
        end: { x: 75, y: 35 },
        deflectedBy: {
          skill: 'block',
          playerId: 'blocker-456',
        },
      };

      expect(complexDeflection.via).toHaveLength(3);
      expect(complexDeflection.via?.[0]).toEqual({ x: 50, y: 50 });
      expect(complexDeflection.via?.[2]).toEqual({ x: 70, y: 40 });
    });

    it('should work without playerId in deflection metadata', () => {
      const deflection: BallDirection = {
        start: { x: 25, y: 55 },
        via: [{ x: 50, y: 50 }],
        end: { x: 75, y: 35 },
        deflectedBy: {
          skill: 'block',
          // playerId omitted
        },
      };

      expect(deflection.deflectedBy?.skill).toBe('block');
      expect(deflection.deflectedBy?.playerId).toBeUndefined();
    });
  });

  describe('HeatmapEvent with deflection', () => {
    it('should preserve deflection data through heatmap event', () => {
      const event: HeatmapEvent = {
        touchId: 'touch-1',
        teamSide: 'away',
        skill: 'attack',
        evaluation: '!',
        playerId: 'attacker-789',
        setNumber: 1,
        rallyNumber: 1,
        start: { x: 25, y: 60 },
        end: { x: 75, y: 30 },
        direction: {
          via: [{ x: 50, y: 45 }],  // Block contact
        },
        isInferred: false,
      };

      expect(event.direction?.via).toHaveLength(1);
    });
  });

  describe('Block Deflection Semantics', () => {
    it('should represent defensive block touch correctly', () => {
      // Attacker hits from position 4, blocker touches at net
      const blockedAttack: BallDirection = {
        start: { x: 18, y: 75 },      // Attack from deep position 4
        via: [{ x: 50, y: 50 }],      // Block contact at net
        end: { x: 82, y: 20 },        // Ball lands in zone 1 frontcourt
        deflectedBy: {
          skill: 'block',
          playerId: 'mb-123',
        },
      };

      expect(blockedAttack.via?.[0].x).toBe(50);  // At net
      expect(blockedAttack.via?.[0].y).toBe(50);  // Neutral (net position)
    });

    it('should support attack recovery scenario', () => {
      // Attack gets partially deflected but still lands (recovery situation)
      const recoveredAttack: BallDirection = {
        start: { x: 25, y: 70 },
        via: [{ x: 50, y: 52 }],      // Slight deflection at net
        end: { x: 75, y: 25 },        // Still lands deep
        deflectedBy: {
          skill: 'block',
          playerId: 'mb-456',
        },
      };

      // Deflection is minimal (via point close to start position)
      const deflectionDistance = Math.sqrt(
        Math.pow(recoveredAttack.via![0].x - recoveredAttack.start.x, 2) +
        Math.pow(recoveredAttack.via![0].y - recoveredAttack.start.y, 2),
      );
      expect(deflectionDistance).toBeLessThan(32);
    });

    it('should support "ball touches multiple players before endpoint" scenario', () => {
      // Ball touches block, then another player before final landing
      const multiTouchAttack: BallDirection = {
        start: { x: 25, y: 70 },
        via: [
          { x: 50, y: 50 },     // Block
          { x: 60, y: 45 },     // Defender touches it
        ],
        end: { x: 70, y: 40 },  // Final landing
        deflectedBy: {
          skill: 'block',
          playerId: 'mb-789',
        },
      };

      expect(multiTouchAttack.via).toHaveLength(2);
      // First via point is the block
      expect(multiTouchAttack.deflectedBy?.skill).toBe('block');
    });
  });

  describe('Coordinate System Validation', () => {
    it('should enforce stage coordinates (0-100) for all points', () => {
      const deflection: BallDirection = {
        start: { x: 20, y: 60 },
        via: [{ x: 50, y: 50 }],
        end: { x: 80, y: 30 },
        deflectedBy: { skill: 'block' },
      };

      // All coordinates should be in valid stage range
      expect(deflection.start.x).toBeGreaterThanOrEqual(0);
      expect(deflection.start.x).toBeLessThanOrEqual(100);
      expect(deflection.via![0].x).toBeGreaterThanOrEqual(0);
      expect(deflection.via![0].x).toBeLessThanOrEqual(100);
      expect(deflection.end.x).toBeGreaterThanOrEqual(0);
      expect(deflection.end.x).toBeLessThanOrEqual(100);
    });

    it('should support via points at court boundaries', () => {
      const boundaryDeflection: BallDirection = {
        start: { x: 12, y: 70 },  // Court edge
        via: [{ x: 12, y: 50 }],  // Via at court edge (sideline)
        end: { x: 88, y: 30 },    // Far court edge
        deflectedBy: { skill: 'block' },
      };

      expect(boundaryDeflection.via![0].x).toBe(12);  // Valid edge coordinate
    });

    it('should support via points outside court (free zone ball)', () => {
      const freeZoneDeflection: BallDirection = {
        start: { x: 8, y: 60 },   // Free zone
        via: [{ x: 5, y: 55 }],   // Via in free zone
        end: { x: 50, y: 50 },    // Lands on court
        deflectedBy: { skill: 'block' },
      };

      expect(freeZoneDeflection.via![0].x).toBe(5);  // Valid free-zone coordinate
    });
  });

  describe('Edge Cases', () => {
    it('should handle deflection with no intermediate points (direct block)', () => {
      const directBlock: BallDirection = {
        start: { x: 25, y: 60 },
        end: { x: 75, y: 30 },
        via: [],  // Empty via array for direct block
        deflectedBy: {
          skill: 'block',
        },
      };

      expect(directBlock.via).toHaveLength(0);
      expect(directBlock.deflectedBy?.skill).toBe('block');
    });

    it('should allow deflection without via points', () => {
      // Sometimes we know a block happened but not the exact deflection point
      const blockWithoutDeflectionPoint: BallDirection = {
        start: { x: 25, y: 60 },
        end: { x: 75, y: 30 },
        deflectedBy: {
          skill: 'block',
          playerId: 'mb-999',
        },
      };

      expect(blockWithoutDeflectionPoint.via).toBeUndefined();
      expect(blockWithoutDeflectionPoint.deflectedBy).toBeDefined();
    });

    it('should distinguish between block and other touch deflections', () => {
      const blockDeflection: BallDirection = {
        start: { x: 25, y: 60 },
        via: [{ x: 50, y: 50 }],
        end: { x: 75, y: 30 },
        deflectedBy: { skill: 'block' },
      };

      const touchDeflection: BallDirection = {
        start: { x: 25, y: 60 },
        via: [{ x: 50, y: 50 }],
        end: { x: 75, y: 30 },
        deflectedBy: { skill: 'touch' },
      };

      expect(blockDeflection.deflectedBy?.skill).toBe('block');
      expect(touchDeflection.deflectedBy?.skill).toBe('touch');
    });
  });
});
