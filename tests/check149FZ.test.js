import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let check149FZ;
beforeAll(() => { check149FZ = loadScript().exports.check149FZ; });

const BASE = 'x'.repeat(60); // выйти за порог 50 символов

describe('check149FZ', () => {
  it('returns status=unknown for short input', () => {
    expect(check149FZ('short').status).toBe('unknown');
  });

  it('finds all 5 points → ok', () => {
    const text = `
      ${BASE}
      ООО "Ромашка". ИНН: 7707083893. ОГРН: 1027700132195.
      Адрес: 123456, г. Москва, ул. Тверская, д. 1.
      Email: contact@romashka.ru, тел.: +7 (495) 123-45-67.
    `;
    const r = check149FZ(text);
    expect(r.found).toBe(5);
    expect(r.status).toBe('ok');
  });

  it('demotes to risk if ИНН/ОГРН missing even with 4 other points', () => {
    const text = `
      ${BASE}
      ООО "Ромашка". Адрес: 123456, г. Москва, ул. Ленина, д. 5.
      Email: info@example.ru. Телефон: +7 495 111 22 33.
    `;
    const r = check149FZ(text);
    expect(r.items.find(i => i.id === 'inn_ogrn').present).toBe(false);
    expect(r.found).toBe(4);
    // По правилу: без ИНН/ОГРН ok → risk
    expect(r.status).toBe('risk');
  });

  it('flags violation when fewer than 2 points present', () => {
    const text = `${BASE} Просто текст без реквизитов и контактов.`;
    const r = check149FZ(text);
    expect(r.status).toBe('violation');
  });

  it('detects ИП name pattern', () => {
    const text = `${BASE} ИП Иванов Иван Иванович. ИНН 770708389305.`;
    const r = check149FZ(text);
    expect(r.items.find(i => i.id === 'name').present).toBe(true);
    expect(r.items.find(i => i.id === 'inn_ogrn').present).toBe(true);
  });

  it('detects email + phone independently', () => {
    const text = `${BASE} Email: hello@x.com. Тел: 8 (812) 555-66-77.`;
    const r = check149FZ(text);
    expect(r.items.find(i => i.id === 'email').present).toBe(true);
    expect(r.items.find(i => i.id === 'phone').present).toBe(true);
  });

  it('detects address via "юридический адрес:"', () => {
    const text = `${BASE} Юридический адрес: 191002, Санкт-Петербург, Невский пр., д. 10.`;
    const r = check149FZ(text);
    expect(r.items.find(i => i.id === 'address').present).toBe(true);
  });
});
