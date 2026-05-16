import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let extractIdentifiers;
beforeAll(() => { extractIdentifiers = loadScript().exports.extractIdentifiers; });

describe('extractIdentifiers', () => {
  it('finds ИНН-10 of a legal entity', () => {
    const r = extractIdentifiers('Реквизиты: ИНН 7707083893 КПП ...');
    expect(r.inn).toBe('7707083893');
    expect(r.type).toBe('ul');
  });

  it('finds ИНН-12 of an individual entrepreneur', () => {
    const r = extractIdentifiers('ИП Петров. ИНН: 770708389305');
    expect(r.inn).toBe('770708389305');
    expect(r.type).toBe('ip');
  });

  it('finds ОГРН-13 (legal entity)', () => {
    const r = extractIdentifiers('ОГРН 1027700132195');
    expect(r.ogrn).toBe('1027700132195');
    expect(r.type).toBe('ul');
  });

  it('finds ОГРНИП-15 (individual entrepreneur)', () => {
    const r = extractIdentifiers('ОГРНИП: 320774600123456');
    expect(r.ogrn).toBe('320774600123456');
    expect(r.type).toBe('ip');
  });

  it('finds both ИНН and ОГРН when both are present', () => {
    const r = extractIdentifiers('ООО "Ромашка" ИНН 7707083893 ОГРН 1027700132195');
    expect(r.inn).toBe('7707083893');
    expect(r.ogrn).toBe('1027700132195');
  });

  it('handles "№" separator after the label', () => {
    const r = extractIdentifiers('ИНН №7707083893');
    expect(r.inn).toBe('7707083893');
  });

  it('does NOT mistake a phone number for ИНН', () => {
    const r = extractIdentifiers('Звоните +7 (495) 123-45-67 по любым вопросам.');
    expect(r.inn).toBeNull();
    expect(r.ogrn).toBeNull();
  });

  it('returns nulls when no identifiers are present', () => {
    const r = extractIdentifiers('Просто текст без реквизитов.');
    expect(r.inn).toBeNull();
    expect(r.ogrn).toBeNull();
    expect(r.type).toBeNull();
  });
});
