import { describe, it, expect } from 'vitest';
import { parseSingleCode, parseDataVolleyInput } from './code-parser';

describe('Code Parser', () => {
  describe('parseSingleCode', () => {
    it('should parse a valid serve code', () => {
      const result = parseSingleCode('*7S+');
      expect(result.valid).toBe(true);
      expect(result.teamSide).toBe('home');
      expect(result.jerseyNumber).toBe(7);
      expect(result.skill).toBe('serve');
      expect(result.evaluation).toBe('+');
    });

    it('should parse a reception code with zones', () => {
      const result = parseSingleCode('a3R56!');
      expect(result.valid).toBe(true);
      expect(result.teamSide).toBe('away');
      expect(result.jerseyNumber).toBe(3);
      expect(result.skill).toBe('receive');
      expect(result.startZone).toBe('5');
      expect(result.endZone).toBe('6');
      expect(result.evaluation).toBe('!');
    });

    it('should parse an attack code without evaluation', () => {
      const result = parseSingleCode('*11A24');
      expect(result.valid).toBe(true);
      expect(result.teamSide).toBe('home');
      expect(result.jerseyNumber).toBe(11);
      expect(result.skill).toBe('attack');
      expect(result.startZone).toBe('2');
      expect(result.endZone).toBe('4');
      expect(result.evaluation).toBeUndefined();
    });

    it('should parse serve with type code', () => {
      const result = parseSingleCode('*7SH+');
      expect(result.valid).toBe(true);
      expect(result.teamSide).toBe('home');
      expect(result.jerseyNumber).toBe(7);
      expect(result.skill).toBe('serve');
      expect(result.skillType).toBe('H');
      expect(result.evaluation).toBe('+');
    });

    it('should parse attack with type and zones', () => {
      const result = parseSingleCode('*11AH24!');
      expect(result.valid).toBe(true);
      expect(result.skill).toBe('attack');
      expect(result.skillType).toBe('H');
      expect(result.startZone).toBe('2');
      expect(result.endZone).toBe('4');
      expect(result.evaluation).toBe('!');
    });

    it('should reject invalid codes', () => {
      const result = parseSingleCode('xyz');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should mark partial codes', () => {
      const result = parseSingleCode('*7');
      expect(result.valid).toBe(false);
      expect(result.partial).toBe(true);
    });

    it('should handle all skill codes', () => {
      const skills = ['S', 'R', 'E', 'A', 'B', 'D', 'F', 'C'];
      skills.forEach((skill) => {
        const result = parseSingleCode(`*5${skill}#`);
        expect(result.valid).toBe(true);
        expect(result.skill).toBeDefined();
      });
    });

    it('should handle all evaluation codes', () => {
      const evals = ['#', '+', '!', '-', '/', '='];
      evals.forEach((e) => {
        const result = parseSingleCode(`*5S${e}`);
        expect(result.valid).toBe(true);
        expect(result.evaluation).toBe(e as any);
      });
    });
  });

  describe('parseDataVolleyInput', () => {
    it('should parse single code', () => {
      const result = parseDataVolleyInput('*7S+');
      expect(result).toHaveLength(1);
      expect(result[0].valid).toBe(true);
    });

    it('should parse multiple codes separated by space', () => {
      const result = parseDataVolleyInput('*7S+ a3R! *11A#');
      expect(result).toHaveLength(3);
      expect(result[0].valid).toBe(true);
      expect(result[1].valid).toBe(true);
      expect(result[2].valid).toBe(true);
    });

    it('should handle mixed valid and invalid codes', () => {
      const result = parseDataVolleyInput('*7S+ invalid a3R!');
      expect(result).toHaveLength(3);
      expect(result[0].valid).toBe(true);
      expect(result[1].valid).toBe(false);
      expect(result[2].valid).toBe(true);
    });

    it('should return empty array for empty input', () => {
      const result = parseDataVolleyInput('');
      expect(result).toHaveLength(0);
    });
  });
});
