import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let hasNameLikePatterns;
beforeAll(() => { hasNameLikePatterns = loadScript().exports.hasNameLikePatterns; });

const padded = (s) => s + ' ' + 'x'.repeat(120);

describe('hasNameLikePatterns', () => {
  it('returns true on full ФИО', () => {
    expect(hasNameLikePatterns(padded('Статья от Иван Иванов Иванович.'))).toBe(true);
  });

  it('returns true on Имя + Фамилия', () => {
    expect(hasNameLikePatterns(padded('Комментирует Анна Петрова.'))).toBe(true);
  });

  it('returns true on initials + surname', () => {
    expect(hasNameLikePatterns(padded('Автор: И.И. Сидоров.'))).toBe(true);
  });

  it('returns true on quoted media title', () => {
    expect(hasNameLikePatterns(padded('Журналист издания «Новая Тётушка» написал.'))).toBe(true);
  });

  it('returns true on a citation verb followed by capitalized text', () => {
    expect(hasNameLikePatterns(padded('Сообщил Алексей о прошедшем мероприятии.'))).toBe(true);
  });

  it('returns false on short text (<100)', () => {
    expect(hasNameLikePatterns('Иван Иванов')).toBe(false);
  });

  it('returns false on generic marketing text without names', () => {
    expect(hasNameLikePatterns(
      'купите сейчас. скидки до 50 процентов. лучшие цены в городе. доставка по всей россии. ' +
      'качественный сервис и низкая стоимость. наши преимущества всем известны. '.repeat(3)
    )).toBe(false);
  });

  it('returns false on null / empty', () => {
    expect(hasNameLikePatterns(null)).toBe(false);
    expect(hasNameLikePatterns('')).toBe(false);
  });
});
