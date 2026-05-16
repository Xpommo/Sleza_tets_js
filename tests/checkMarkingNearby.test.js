import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let checkMarkingNearby;
beforeAll(() => { checkMarkingNearby = loadScript().exports.checkMarkingNearby; });

describe('checkMarkingNearby', () => {
  it('returns found:false when name is not in text', () => {
    const r = checkMarkingNearby('Просто статья без имени.', 'Иван Иванов', 'inoagent');
    expect(r.found).toBe(false);
  });

  it('finds local marking within ±200/+400 window', () => {
    const text = 'В эфире выступил Иван Иванов (внесён в реестр иностранных агентов) и рассказал.';
    const r = checkMarkingNearby(text, 'Иван Иванов', 'inoagent');
    expect(r.found).toBe(true);
    expect(r.hasMarking).toBe(true);
    expect(r.via).toBe('context');
  });

  it('finds star + footnote marking at the bottom of the document', () => {
    const tail = ' '.repeat(200) + '\n* — лицо, признанное иностранным агентом в Российской Федерации.';
    const text = 'Сегодня Алексей Петров* написал колонку про спорт.' + ' '.repeat(500) + tail;
    const r = checkMarkingNearby(text, 'Алексей Петров', 'inoagent');
    expect(r.found).toBe(true);
    expect(r.hasMarking).toBe(true);
    expect(r.via).toBe('asterisk');
  });

  it('returns found:true / hasMarking:false when name has no marking', () => {
    const text = 'Сегодня Иван Иванов рассказал свою историю. ' + 'x'.repeat(500);
    const r = checkMarkingNearby(text, 'Иван Иванов', 'inoagent');
    expect(r.found).toBe(true);
    expect(r.hasMarking).toBe(false);
  });

  it('finds marking in document tail (last 3000 chars)', () => {
    const lead = 'Сегодня Анна Петрова дала интервью.' + ' '.repeat(1500);
    const tail = 'Напоминаем: Анна Петрова признана иностранным агентом.';
    const r = checkMarkingNearby(lead + tail, 'Анна Петрова', 'inoagent');
    expect(r.found).toBe(true);
    expect(r.hasMarking).toBe(true);
  });
});
