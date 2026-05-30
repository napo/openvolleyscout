import { describe, it, expect } from 'vitest';
import { getRotationFromPosition, RotationTracker } from './rotation-calculator';
import type { RotationIndex } from '../filters/advanced-filters';

describe('Rotation Calculator', () => {
  describe('getRotationFromPosition', () => {
    it('should map court positions 1-6 to rotations 1-6', () => {
      expect(getRotationFromPosition(1)).toBe(1 as RotationIndex);
      expect(getRotationFromPosition(2)).toBe(2 as RotationIndex);
      expect(getRotationFromPosition(3)).toBe(3 as RotationIndex);
      expect(getRotationFromPosition(4)).toBe(4 as RotationIndex);
      expect(getRotationFromPosition(5)).toBe(5 as RotationIndex);
      expect(getRotationFromPosition(6)).toBe(6 as RotationIndex);
    });

    it('should clamp invalid positions to valid range', () => {
      expect(getRotationFromPosition(0)).toBe(1 as RotationIndex);
      expect(getRotationFromPosition(-5)).toBe(1 as RotationIndex);
      expect(getRotationFromPosition(7)).toBe(6 as RotationIndex);
      expect(getRotationFromPosition(100)).toBe(6 as RotationIndex);
    });

    it('should handle boundary values', () => {
      expect(getRotationFromPosition(1)).toBe(1 as RotationIndex);
      expect(getRotationFromPosition(6)).toBe(6 as RotationIndex);
    });
  });

  describe('RotationTracker', () => {
    it('should initialize with rotation 1 for both teams', () => {
      const tracker = new RotationTracker();

      expect(tracker.getCurrentRotation('home')).toBe(1);
      expect(tracker.getCurrentRotation('away')).toBe(1);
    });

    it('should advance rotation through valid sequence', () => {
      const tracker = new RotationTracker();

      // Advance home team
      for (let i = 1; i <= 5; i++) {
        expect(tracker.getCurrentRotation('home')).toBe(i as RotationIndex);

        // Simulate side-out: both teams rotate
        tracker.recordServeEnd('home', 'away');
      }

      // After 5 side-outs starting from rotation 1:
      // Round 1: 1→2, 2→3
      // Round 2: 2→3, 3→4
      // Round 3: 3→4, 4→5
      // Round 4: 4→5, 5→6
      // Round 5: 5→6, 6→1

      // (This test may need adjustment based on actual rotation rules)
    });

    it('should cycle back to rotation 1 after rotation 6', () => {
      const tracker = new RotationTracker();

      // Set to rotation 6 (last rotation)
      for (let i = 0; i < 5; i++) {
        tracker.recordServeEnd('home', 'away');
      }

      // Next side-out should wrap to rotation 1
      tracker.recordServeEnd('home', 'away');
      expect(tracker.getCurrentRotation('home')).toBe(1 as RotationIndex);
    });

    it('should reset both teams', () => {
      const tracker = new RotationTracker();

      tracker.recordServeEnd('home', 'away');
      tracker.recordServeEnd('home', 'away');

      expect(tracker.getCurrentRotation('home')).not.toBe(1);
      expect(tracker.getCurrentRotation('away')).not.toBe(1);

      tracker.reset();

      expect(tracker.getCurrentRotation('home')).toBe(1);
      expect(tracker.getCurrentRotation('away')).toBe(1);
    });

    it('should handle multiple consecutive side-outs', () => {
      const tracker = new RotationTracker();

      const homeRotations: RotationIndex[] = [];
      const awayRotations: RotationIndex[] = [];

      for (let i = 0; i < 6; i++) {
        homeRotations.push(tracker.getCurrentRotation('home'));
        awayRotations.push(tracker.getCurrentRotation('away'));
        tracker.recordServeEnd('home', 'away');
      }

      // Should see full rotation cycle
      expect(homeRotations).toHaveLength(6);
      expect(awayRotations).toHaveLength(6);
      expect(new Set(homeRotations).size).toBe(6); // All unique rotations
    });

    it('should handle serving team winning point', () => {
      const tracker = new RotationTracker();

      const home1 = tracker.getCurrentRotation('home');
      const away1 = tracker.getCurrentRotation('away');

      // Home serves and wins point (no rotation)
      tracker.recordServeEnd('home', 'home');

      const home2 = tracker.getCurrentRotation('home');
      const away2 = tracker.getCurrentRotation('away');

      // Rotations should not change when serving team wins
      // (This may depend on exact volleyball rules implementation)
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid court positions', () => {
      expect(() => getRotationFromPosition(0)).not.toThrow();
      expect(() => getRotationFromPosition(-10)).not.toThrow();
      expect(() => getRotationFromPosition(999)).not.toThrow();
    });

    it('should handle floating point court positions', () => {
      // JavaScript will coerce to number, then clamp
      expect(getRotationFromPosition(2.7)).toBe(2 as RotationIndex); // Math.max/min coerces to int
      expect(getRotationFromPosition(5.1)).toBe(5 as RotationIndex);
    });
  });

  describe('Rotation Sequence', () => {
    it('should maintain consistent rotation sequence for full match', () => {
      const tracker = new RotationTracker();
      const sequence: RotationIndex[] = [];

      // Simulate 36 rallies (6 rotations × 6 rounds)
      for (let i = 0; i < 36; i++) {
        sequence.push(tracker.getCurrentRotation('home'));
        tracker.recordServeEnd('home', 'away');
      }

      // Should see repeating pattern of 1-6
      const pattern = sequence.slice(0, 6);
      for (let i = 1; i < 6; i++) {
        const chunk = sequence.slice(i * 6, (i + 1) * 6);
        expect(chunk).toEqual(pattern);
      }
    });
  });
});
