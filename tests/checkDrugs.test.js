import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let checkDrugs;
beforeAll(() => { checkDrugs = loadScript().exports.checkDrugs; });

const PAD = ' ' + 'x'.repeat(120);

describe('checkDrugs', () => {
  it('returns ok for short input', () => {
    expect(checkDrugs('short').status).toBe('ok');
    expect(checkDrugs('short').hasMentions).toBe(false);
  });

  it('returns ok when no drug terms present', () => {
    const r = checkDrugs(PAD + ' Обычная статья про спорт и здоровый образ жизни.');
    expect(r.hasMentions).toBe(false);
    expect(r.status).toBe('ok');
  });

  it('flags violation for 3+ unique drug terms without context', () => {
    const text = PAD + ' Молодёжная вечеринка: героин, кокаин, амфетамин — обычное дело.';
    const r = checkDrugs(text);
    expect(r.hasMentions).toBe(true);
    expect(r.withoutContext).toBeGreaterThanOrEqual(3);
    expect(r.status).toBe('violation');
  });

  it('flags risk for 1-2 drug terms without context', () => {
    const text = PAD + ' Случайно упомянули героин в светской хронике.';
    const r = checkDrugs(text);
    expect(r.hasMentions).toBe(true);
    expect(r.withoutContext).toBeGreaterThanOrEqual(1);
    expect(r.withoutContext).toBeLessThanOrEqual(2);
    expect(r.status).toBe('risk');
  });

  it('returns ok when drug terms appear in legal/medical context', () => {
    const text = PAD + ` Статья УК РФ 228 запрещает оборот наркотиков. Героин включён
      в список запрещённых веществ. Профилактика наркомании среди подростков.`;
    const r = checkDrugs(text);
    expect(r.hasMentions).toBe(true);
    // Все упоминания в контексте → ok
    expect(r.status).toBe('ok');
    expect(r.withContext).toBeGreaterThan(0);
  });

  it('reports total mentions and unique term counts correctly', () => {
    const text = PAD + ' героин. героин. героин. кокаин. ';
    const r = checkDrugs(text);
    expect(r.totalMentions).toBe(4);
    expect(r.mentions.length).toBe(2); // 2 unique terms
    expect(r.mentions.find(m => m.term === 'героин').count).toBe(3);
  });
});
