import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let parseEgrulData;
beforeAll(() => { parseEgrulData = loadScript().exports.parseEgrulData; });

describe('parseEgrulData', () => {
  it('parses canonical СвЮЛ shape', () => {
    const data = {
      СвЮЛ: {
        НаимЮЛПолн: 'Общество с ограниченной ответственностью "Ромашка"',
        НаимЮЛСокр: 'ООО "Ромашка"',
        ИНН: '7707083893',
        ОГРН: '1027700132195',
        КПП: '770701001',
        ДатаОГРН: '15.06.2002',
        СвАдресЮЛ: { АдресПолн: '123456, г. Москва, ул. Тверская, д. 1' },
      },
    };
    const r = parseEgrulData(data);
    expect(r.type).toBe('ul');
    expect(r.name).toContain('Ромашка');
    expect(r.shortName).toContain('ООО');
    expect(r.inn).toBe('7707083893');
    expect(r.ogrn).toBe('1027700132195');
    expect(r.kpp).toBe('770701001');
    expect(r.address).toContain('Москва');
    expect(r.isActive).toBe(true);
    expect(r.regDate).toBe('15.06.2002');
  });

  it('parses flat НаимЮЛПолн shape (no СвЮЛ wrapper)', () => {
    const data = {
      НаимЮЛПолн: 'ООО "Тест"',
      ИНН: '7700000001',
      ОГРН: '1027700000001',
    };
    const r = parseEgrulData(data);
    expect(r.type).toBe('ul');
    expect(r.name).toBe('ООО "Тест"');
    expect(r.inn).toBe('7700000001');
  });

  it('marks ЮЛ as inactive when СвПрекрЮЛ is present', () => {
    const data = {
      СвЮЛ: {
        НаимЮЛПолн: 'ООО "Закрытое"',
        ИНН: '7700000002',
        ОГРН: '1027700000002',
        СвПрекрЮЛ: { НаимСпсПрекрЮЛ: 'Ликвидация юридического лица' },
      },
    };
    const r = parseEgrulData(data);
    expect(r.isActive).toBe(false);
    expect(r.reason).toBe('Ликвидация юридического лица');
  });

  it('marks ЮЛ as inactive when status code is 5', () => {
    const data = {
      СвЮЛ: {
        НаимЮЛПолн: 'ООО "Снятое"',
        ИНН: '7700000003',
        ОГРН: '1027700000003',
        СвСтатус: { КодСтатусЮЛ: '5' },
      },
    };
    const r = parseEgrulData(data);
    expect(r.isActive).toBe(false);
  });

  it('parses canonical СвИП shape', () => {
    const data = {
      СвИП: {
        ОГРНИП: '320774600123456',
        ИННФЛ: '770708389305',
        ДатаОГРНИП: '01.01.2020',
        СвФЛ: { Фамилия: 'Иванов', Имя: 'Иван', Отчество: 'Иванович' },
      },
    };
    const r = parseEgrulData(data);
    expect(r.type).toBe('ip');
    expect(r.name).toContain('Иванов');
    expect(r.name).toContain('Иван');
    expect(r.inn).toBe('770708389305');
    expect(r.ogrn).toBe('320774600123456');
    expect(r.isActive).toBe(true);
  });

  it('parses flat ОГРНИП shape (no СвИП wrapper)', () => {
    const data = {
      ОГРНИП: '320774600999999',
      ИНН: '770700000099',
      Фамилия: 'Петров',
      Имя: 'Петр',
    };
    const r = parseEgrulData(data);
    expect(r.type).toBe('ip');
    expect(r.ogrn).toBe('320774600999999');
    expect(r.name).toContain('Петров');
  });

  it('marks ИП as inactive when СвПрекрИП is present', () => {
    const data = {
      СвИП: {
        ОГРНИП: '320774600111111',
        ИННФЛ: '770700000011',
        СвФЛ: { Фамилия: 'Сидоров', Имя: 'Сидор' },
        СвПрекрИП: { Code: 'whatever' },
      },
    };
    const r = parseEgrulData(data);
    expect(r.isActive).toBe(false);
  });

  it('returns empty defaults for null / unknown shape', () => {
    expect(parseEgrulData(null).type).toBe('unknown');
    expect(parseEgrulData({}).type).toBe('unknown');
    expect(parseEgrulData({ random: 'garbage' }).name).toBe('');
  });
});
