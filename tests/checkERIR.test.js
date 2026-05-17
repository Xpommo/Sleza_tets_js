import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let checkERIR;
beforeAll(() => { checkERIR = loadScript().exports.checkERIR; });

const PAD = 'x'.repeat(120);

describe('checkERIR', () => {
  it('returns unknown for short input', () => {
    expect(checkERIR('short').status).toBe('unknown');
  });

  it('returns ok when no ad content present', () => {
    const r = checkERIR(PAD + ' Обычная редакционная статья без рекламы.');
    expect(r.hasAdContent).toBe(false);
    expect(r.status).toBe('ok');
  });

  it('flags violation when ad present but no markers', () => {
    const r = checkERIR(PAD + ' Спонсорский материал о фитнес-клубе.');
    expect(r.hasAdContent).toBe(true);
    expect(r.found).toBe(0);
    expect(r.status).toBe('violation');
  });

  it('flags ok when ad has erid + label + advertiser', () => {
    const text = `
      ${PAD}
      На правах рекламы. Реклама. ERID: abc1234567.
      Рекламодатель: ООО "Тест", ИНН 7707083893.
    `;
    const r = checkERIR(text);
    expect(r.hasAdContent).toBe(true);
    expect(r.found).toBe(3);
    expect(r.status).toBe('ok');
  });

  it('flags risk with 2 of 3 markers', () => {
    const text = `
      ${PAD}
      На правах рекламы. ERID: zyx9876543. (без данных рекламодателя)
    `;
    const r = checkERIR(text);
    expect(r.hasAdContent).toBe(true);
    expect(r.found).toBe(2);
    expect(r.status).toBe('risk');
  });

  it('detects English "sponsored content"', () => {
    const r = checkERIR(PAD + ' Sponsored content by Acme Corp.');
    expect(r.hasAdContent).toBe(true);
  });
});
