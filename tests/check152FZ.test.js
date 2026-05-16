import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let check152FZ;
beforeAll(() => { check152FZ = loadScript().exports.check152FZ; });

const FULL_POLICY = `
Политика конфиденциальности

1. Категории персональных данных
Оператор обрабатывает следующие категории персональных данных субъектов:
ФИО, email, телефон, адрес доставки.

2. Цели обработки персональных данных
Обработка осуществляется в целях исполнения договора и информирования
о новых услугах.

3. Правовое основание обработки
Обработка ведётся в соответствии с 152-ФЗ "О персональных данных",
на основании согласия субъекта.

4. Срок хранения персональных данных
Данные хранятся в течение 5 лет с момента получения согласия.
Удаляются по достижении целей обработки.

5. Права субъекта персональных данных
Субъект вправе отозвать согласие, потребовать удаления данных,
обратиться к оператору для уточнения информации.

6. Контакты ответственного за обработку
По всем вопросам пишите на privacy@example.ru или звоните +7 (495) 123-45-67.

7. Передача данных третьим лицам
Передача данных третьим лицам осуществляется только с согласия субъекта,
за исключением случаев, предусмотренных законом.
`;

describe('check152FZ — happy path', () => {
  it('finds all 7 mandatory points in a well-formed policy', () => {
    const r = check152FZ(FULL_POLICY);
    expect(r.found).toBe(7);
    expect(r.total).toBe(7);
    expect(r.status).toBe('ok');
    expect(r.items.map(i => i.id).sort()).toEqual(
      ['categories', 'contact', 'legal_basis', 'purposes', 'storage_term', 'subject_rights', 'third_parties'].sort()
    );
    expect(r.items.every(i => i.present)).toBe(true);
    expect(r.items.every(i => i.confirmedBy === 'local')).toBe(true);
  });

  it('still finds points without numbered section headers', () => {
    const flatPolicy = FULL_POLICY.replace(/^\d+\.\s+/gm, '');
    const r = check152FZ(flatPolicy);
    expect(r.found).toBeGreaterThanOrEqual(6);
    expect(['ok', 'risk']).toContain(r.status);
  });
});

describe('check152FZ — empty / short input', () => {
  it('returns no_policy for null', () => {
    expect(check152FZ(null).status).toBe('no_policy');
  });

  it('returns no_policy for empty string', () => {
    expect(check152FZ('').status).toBe('no_policy');
  });

  it('returns no_policy for too-short text (<100)', () => {
    const r = check152FZ('Политика конфиденциальности коротенькая');
    expect(r.status).toBe('no_policy');
    expect(r.found).toBe(0);
  });
});

describe('check152FZ — partial policies', () => {
  it('flags as risk when 3-5 points present', () => {
    const partial = `
      Политика обработки. Цели обработки данных — исполнение договора.
      Правовое основание — 152-ФЗ. Срок хранения — 3 года.
      Контакты: info@example.com. Прочий текст для длины. ${'x'.repeat(200)}
    `;
    const r = check152FZ(partial);
    expect(r.status).toBe('risk');
    expect(r.found).toBeGreaterThanOrEqual(3);
    expect(r.found).toBeLessThanOrEqual(5);
  });

  it('flags as violation when fewer than 3 points present', () => {
    const bad = `
      Этот сайт собирает информацию о посетителях. Мы любим наших клиентов.
      Никакой конкретики о персональных данных. ${'lorem '.repeat(50)}
    `;
    const r = check152FZ(bad);
    expect(r.status).toBe('violation');
    expect(r.found).toBeLessThan(3);
  });
});

describe('check152FZ — section-aware', () => {
  it('counts a numbered heading as evidence even without body keywords', () => {
    const headersOnly = `
      Политика конфиденциальности
      1. Категории персональных данных
      2. Цели обработки персональных данных
      3. Правовое основание обработки
      4. Срок хранения персональных данных
      5. Права субъекта персональных данных
      6. Контакты оператора для связи
      7. Передача данных третьим лицам
      ${'x'.repeat(200)}
    `;
    const r = check152FZ(headersOnly);
    expect(r.found).toBe(7);
    expect(r.status).toBe('ok');
  });
});

describe('check152FZ — individual points', () => {
  const base = 'Политика. ' + 'x'.repeat(150) + ' ';

  it('detects subject_rights via "вправе отозвать"', () => {
    const r = check152FZ(base + 'Субъект вправе отозвать согласие на обработку.');
    const item = r.items.find(i => i.id === 'subject_rights');
    expect(item.present).toBe(true);
  });

  it('detects contact via email regex', () => {
    const r = check152FZ(base + 'Связь: privacy.officer@company-name.ru.');
    expect(r.items.find(i => i.id === 'contact').present).toBe(true);
  });

  it('detects third_parties via "третьим лицам"', () => {
    const r = check152FZ(base + 'Передача данных третьим лицам не осуществляется.');
    expect(r.items.find(i => i.id === 'third_parties').present).toBe(true);
  });

  it('detects storage_term via "хранятся в течение N лет"', () => {
    const r = check152FZ(base + 'Данные хранятся в течение 3 лет.');
    expect(r.items.find(i => i.id === 'storage_term').present).toBe(true);
  });
});
