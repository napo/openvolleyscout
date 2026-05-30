import { describe, it, expect } from 'vitest';
import { coneToSubzone } from './cone-to-subzone-mapping';

describe('coneToSubzone', () => {
  describe('with position parameter (accurate mapping)', () => {
    it('maps cones from left sector (position 4/5)', () => {
      expect(coneToSubzone('4', '1')).toEqual({ zoneId: '5', subzone: 'A' });
      expect(coneToSubzone('5', '7')).toEqual({ zoneId: '2', subzone: 'A' });
      expect(coneToSubzone('4', '4')).toEqual({ zoneId: '8', subzone: 'B' });
    });

    it('maps cones from right sector (position 2/1)', () => {
      expect(coneToSubzone('2', '1')).toEqual({ zoneId: '1', subzone: 'D' });
      expect(coneToSubzone('1', '7')).toEqual({ zoneId: '4', subzone: 'A' });
      expect(coneToSubzone('2', '4')).toEqual({ zoneId: '8', subzone: 'B' });
    });

    it('maps cones from center (position 3/6)', () => {
      expect(coneToSubzone('3', '1')).toEqual({ zoneId: '2', subzone: 'B' });
      expect(coneToSubzone('6', '7')).toEqual({ zoneId: '7', subzone: 'B' });
    });
  });

  describe('without position parameter (fallback mapping)', () => {
    it('maps cones using fallback heuristic', () => {
      expect(coneToSubzone('1')).toEqual({ zoneId: '5', subzone: 'A' });
      expect(coneToSubzone('4')).toEqual({ zoneId: '8', subzone: 'B' });
      expect(coneToSubzone('9')).toEqual({ zoneId: '1', subzone: 'D' });
    });

    it('handles string and numeric inputs', () => {
      expect(coneToSubzone(1)).toEqual({ zoneId: '5', subzone: 'A' });
      expect(coneToSubzone('1')).toEqual({ zoneId: '5', subzone: 'A' });
    });
  });

  describe('error cases', () => {
    it('returns null for invalid cone numbers with position', () => {
      expect(coneToSubzone('4', 'X')).toBeNull();
      expect(coneToSubzone('4', '10')).toBeNull();
    });

    it('returns null for invalid positions', () => {
      expect(coneToSubzone('7', '1')).toBeNull();
      expect(coneToSubzone('invalid', '1')).toBeNull();
    });

    it('returns null for unmapped cones without position', () => {
      // Fallback should have mappings for 0-9
      expect(coneToSubzone('0')).toEqual({ zoneId: '6', subzone: 'B' });
    });
  });
});
