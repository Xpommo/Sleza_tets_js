import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let parseSlezaItem;
beforeAll(() => { parseSlezaItem = loadScript().exports.parseSlezaItem; });

describe('parseSlezaItem', () => {
  it('parses "Name (Marking)"', () => {
    const r = parseSlezaItem('Иван Иванов (иностранный агент)');
    expect(r.name).toBe('Иван Иванов');
    expect(r.marking).toBe('иностранный агент');
    expect(r.category).toBe('inoagent');
  });

  it('categorizes extremist organizations', () => {
    const r = parseSlezaItem('"Запрещённое движение" (экстремистская организация)');
    expect(r.category).toBe('extremist');
  });

  it('categorizes terrorist organizations', () => {
    const r = parseSlezaItem('Группа X (террористическая организация)');
    expect(r.category).toBe('terrorist');
  });

  it('categorizes undesirable foreign orgs', () => {
    const r = parseSlezaItem('Фонд Y (нежелательная в РФ организация)');
    expect(r.category).toBe('undesirable');
  });

  it('falls back to category=other when no parens', () => {
    const r = parseSlezaItem('Просто имя без скобок');
    expect(r.name).toBe('Просто имя без скобок');
    expect(r.marking).toBe('');
    expect(r.category).toBe('other');
  });

  it('strips trailing 💧 emoji from marking', () => {
    const r = parseSlezaItem('Имя (иноагент) 💧');
    expect(r.marking).not.toContain('💧');
    expect(r.category).toBe('inoagent');
  });
});
