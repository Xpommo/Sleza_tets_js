import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let plural;
beforeAll(() => { plural = loadScript().exports.plural; });

describe('plural — Russian declension', () => {
  // Uses "упоминание/упоминания/упоминаний" as the canonical example set.
  const one = 'упоминание', two = 'упоминания', many = 'упоминаний';
  const p = n => plural(n, one, two, many);

  it('1 → one', () => expect(p(1)).toBe(one));
  it('2 → two', () => expect(p(2)).toBe(two));
  it('3 → two', () => expect(p(3)).toBe(two));
  it('4 → two', () => expect(p(4)).toBe(two));
  it('5 → many', () => expect(p(5)).toBe(many));
  it('0 → many', () => expect(p(0)).toBe(many));
  it('11 → many (teens exception)', () => expect(p(11)).toBe(many));
  it('12 → many (teens exception)', () => expect(p(12)).toBe(many));
  it('13 → many (teens exception)', () => expect(p(13)).toBe(many));
  it('14 → many (teens exception)', () => expect(p(14)).toBe(many));
  it('21 → one', () => expect(p(21)).toBe(one));
  it('22 → two', () => expect(p(22)).toBe(two));
  it('101 → one', () => expect(p(101)).toBe(one));
  it('111 → many (teens exception)', () => expect(p(111)).toBe(many));
  it('112 → many (teens exception)', () => expect(p(112)).toBe(many));
});
