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

  // B3: ad network script detection
  it('B3: hasAdScripts=true → hasAdContent=true even without text markers', () => {
    const r = checkERIR(PAD + ' Обычная страница без рекламных слов.', { hasAdScripts: true });
    expect(r.hasAdContent).toBe(true);
    expect(r.hasAdScripts).toBe(true);
  });

  it('B3: hasAdScripts=true without text ad markers → risk (retargeting/analytics, not hosted ads)', () => {
    const r = checkERIR(PAD + ' Обычная страница.', { hasAdScripts: true });
    expect(r.status).toBe('risk');
  });

  it('B3: hasAdScripts=true WITH text ad markers but no ERID → violation', () => {
    const r = checkERIR(PAD + ' Партнёрский материал. На правах рекламы.', { hasAdScripts: true });
    expect(r.status).toBe('violation');
  });

  it('B3: hasAdScripts=true + ERID + метка + рекламодатель → ok', () => {
    const text = PAD + ' ERID: abc1234567. Реклама. Рекламодатель: ООО "Тест", ИНН 7707083893.';
    const r = checkERIR(text, { hasAdScripts: true });
    expect(r.status).toBe('ok');
  });

  it('B3: hasAdScripts=false → backward compatible, text-only detection', () => {
    const r = checkERIR(PAD + ' Обычная страница без рекламы.', { hasAdScripts: false });
    expect(r.hasAdContent).toBe(false);
    expect(r.status).toBe('ok');
  });
});
