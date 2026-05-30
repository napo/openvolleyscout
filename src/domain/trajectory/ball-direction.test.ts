import { describe, it, expect } from 'vitest';
import type { BallDirection, StagePoint } from './types';

describe('BallDirection', () => {
  describe('Backward Compatibility', () => {
    it('should work with minimal required fields', () => {
      const start: StagePoint = { x: 25, y: 50 };
      const end: StagePoint = { x: 75, y: 75 };

      const direction: BallDirection = {
        start,
        end,
      };

      expect(direction.start).toEqual(start);
      expect(direction.end).toEqual(end);
      expect(direction.via).toBeUndefined();
      expect(direction.deflectedBy).toBeUndefined();
    });

    it('should work with legacy zone data only', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        courtZoneStart: '6',
        courtZoneEnd: '1',
      };

      expect(direction.courtZoneStart).toBe('6');
      expect(direction.courtZoneEnd).toBe('1');
      expect(direction.subzoneStart).toBeUndefined();
      expect(direction.subzoneEnd).toBeUndefined();
      expect(direction.via).toBeUndefined();
    });

    it('should work with subzone data', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        subzoneStart: 'A',
        subzoneEnd: 'C',
      };

      expect(direction.subzoneStart).toBe('A');
      expect(direction.subzoneEnd).toBe('C');
      expect(direction.via).toBeUndefined();
    });
  });

  describe('Multi-Point Trajectories', () => {
    it('should support intermediate points (via)', () => {
      const start: StagePoint = { x: 25, y: 50 };
      const via1: StagePoint = { x: 50, y: 60 };
      const via2: StagePoint = { x: 60, y: 70 };
      const end: StagePoint = { x: 75, y: 80 };

      const direction: BallDirection = {
        start,
        end,
        via: [via1, via2],
      };

      expect(direction.via).toHaveLength(2);
      expect(direction.via?.[0]).toEqual(via1);
      expect(direction.via?.[1]).toEqual(via2);
    });

    it('should support single intermediate point', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        via: [{ x: 50, y: 60 }],
      };

      expect(direction.via).toHaveLength(1);
    });

    it('should support empty via array', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        via: [],
      };

      expect(direction.via).toHaveLength(0);
    });
  });

  describe('Deflection Metadata', () => {
    it('should track block deflection', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        deflectedBy: {
          skill: 'block',
          playerId: 'player-123',
        },
      };

      expect(direction.deflectedBy?.skill).toBe('block');
      expect(direction.deflectedBy?.playerId).toBe('player-123');
    });

    it('should track touch deflection', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        deflectedBy: {
          skill: 'touch',
          playerId: 'player-456',
        },
      };

      expect(direction.deflectedBy?.skill).toBe('touch');
      expect(direction.deflectedBy?.playerId).toBe('player-456');
    });

    it('should allow deflection without playerId', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        deflectedBy: {
          skill: 'block',
        },
      };

      expect(direction.deflectedBy?.skill).toBe('block');
      expect(direction.deflectedBy?.playerId).toBeUndefined();
    });
  });

  describe('Complex Scenarios', () => {
    it('should support attack with block deflection', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 }, // Attack start
        end: { x: 75, y: 20 }, // Final landing after deflection
        via: [{ x: 70, y: 40 }], // Block contact point
        courtZoneStart: '4',
        courtZoneEnd: '1',
        deflectedBy: {
          skill: 'block',
          playerId: 'blocker-789',
        },
      };

      expect(direction.via).toHaveLength(1);
      expect(direction.deflectedBy?.skill).toBe('block');
      expect(direction.courtZoneStart).toBe('4');
    });

    it('should support reception with multiple touches', () => {
      const direction: BallDirection = {
        start: { x: 50, y: 75 }, // Serve reception
        end: { x: 50, y: 50 }, // Final set position
        via: [
          { x: 48, y: 70 }, // Bump touch
          { x: 50, y: 60 }, // Mid-flight
        ],
        subzoneStart: 'B',
        subzoneEnd: 'A',
      };

      expect(direction.via).toHaveLength(2);
      expect(direction.subzoneStart).toBe('B');
    });

    it('should handle undefined deflectedBy with via points', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        via: [{ x: 50, y: 60 }],
        deflectedBy: undefined,
      };

      expect(direction.via).toHaveLength(1);
      expect(direction.deflectedBy).toBeUndefined();
    });
  });

  describe('Type Safety', () => {
    it('should enforce valid skill types in deflection', () => {
      // This test is primarily for TypeScript compilation
      const validBlock: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        deflectedBy: { skill: 'block' },
      };

      const validTouch: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        deflectedBy: { skill: 'touch' },
      };

      expect(validBlock.deflectedBy?.skill).toBe('block');
      expect(validTouch.deflectedBy?.skill).toBe('touch');
    });

    it('should enforce valid subzone values', () => {
      const direction: BallDirection = {
        start: { x: 25, y: 50 },
        end: { x: 75, y: 75 },
        subzoneStart: 'A',
        subzoneEnd: 'D',
      };

      expect(['A', 'B', 'C', 'D']).toContain(direction.subzoneStart!);
      expect(['A', 'B', 'C', 'D']).toContain(direction.subzoneEnd!);
    });
  });
});
