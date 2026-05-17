import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let buildLocalChecks;
beforeAll(() => { ({ buildLocalChecks } = loadScript().exports); });

function make152(status, found = 7) {
  const labels = ['Цели обработки', 'Правовое основание', 'Перечень данных',
    'Передача третьим лицам', 'Права субъектов', 'Срок хранения', 'Сведения об операторе'];
  const items = labels.map((label, i) => ({
    id: `item${i}`, label, present: i < found,
  }));
  return { status, found, total: 7, items };
}

function makeCookie(status) {
  return { status, title: `Cookie status: ${status}` };
}

describe('buildLocalChecks', () => {
  it('returns an array with ids matching AI_LAW_STUBS (drugs, law152, erir, law149, offer)', () => {
    const result = buildLocalChecks({});
    const ids = result.map(c => c.id);
    expect(ids).toContain('drugs');
    expect(ids).toContain('law152');
    expect(ids).toContain('erir');
    expect(ids).toContain('law149');
    expect(ids).toContain('offer');
  });

  it('152 ok + cookie ok → law152 stays ok', () => {
    const result = buildLocalChecks({ result152: make152('ok', 7), resultCookie: makeCookie('ok') });
    expect(result.find(c => c.id === 'law152').status).toBe('ok');
  });

  it('152 no_policy maps to violation', () => {
    const result = buildLocalChecks({
      result152: { status: 'no_policy', found: 0, total: 7, items: [] },
      resultCookie: makeCookie('ok'),
    });
    expect(result.find(c => c.id === 'law152').status).toBe('violation');
  });

  it('cookie violation upgrades 152 ok → risk', () => {
    const result = buildLocalChecks({ result152: make152('ok', 7), resultCookie: makeCookie('violation') });
    expect(result.find(c => c.id === 'law152').status).toBe('risk');
  });

  it('cookie risk upgrades 152 ok → risk', () => {
    const result = buildLocalChecks({ result152: make152('ok', 7), resultCookie: makeCookie('risk') });
    expect(result.find(c => c.id === 'law152').status).toBe('risk');
  });

  it('cookie violation does not override 152 violation (stays violation)', () => {
    const result = buildLocalChecks({ result152: make152('violation', 3), resultCookie: makeCookie('violation') });
    expect(result.find(c => c.id === 'law152').status).toBe('violation');
  });

  it('cookie violation does not override 152 risk (stays risk)', () => {
    const result = buildLocalChecks({ result152: make152('risk', 5), resultCookie: makeCookie('violation') });
    expect(result.find(c => c.id === 'law152').status).toBe('risk');
  });

  it('without result152 provided → law152 stays unknown', () => {
    const result = buildLocalChecks({ resultCookie: makeCookie('violation') });
    expect(result.find(c => c.id === 'law152').status).toBe('unknown');
  });

  it('drugs violation sets correct status', () => {
    const resultDrugs = {
      status: 'violation',
      hasMentions: true,
      withoutContext: 2,
      totalMentions: 2,
      mentions: [{ term: 'героин', hasContext: false }, { term: 'кокаин', hasContext: false }],
    };
    const result = buildLocalChecks({ resultDrugs });
    expect(result.find(c => c.id === 'drugs').status).toBe('violation');
  });

  it('drugs ok (in legal context) reflects status', () => {
    const resultDrugs = {
      status: 'ok',
      hasMentions: true,
      withoutContext: 0,
      totalMentions: 1,
      mentions: [{ term: 'наркотик', hasContext: true }],
    };
    const result = buildLocalChecks({ resultDrugs });
    expect(result.find(c => c.id === 'drugs').status).toBe('ok');
  });
});

describe('buildLocalChecks — 149-ФЗ', () => {
  it('149 ok status passes through', () => {
    const result149 = { status: 'ok', found: 5, total: 5, items: [] };
    const result = buildLocalChecks({ result149 });
    expect(result.find(c => c.id === 'law149').status).toBe('ok');
  });

  it('149 violation passes through', () => {
    const result149 = { status: 'violation', found: 1, total: 5, items: [{ id: 'inn_ogrn', label: 'ИНН/ОГРН', present: false }] };
    const result = buildLocalChecks({ result149 });
    expect(result.find(c => c.id === 'law149').status).toBe('violation');
  });

  it('inactive EGRUL overrides 149 status → violation', () => {
    const result149 = { status: 'ok', found: 5, total: 5, items: [] };
    const egrul = { result: { parsed: { isActive: false, reason: 'Ликвидация' }, found: true } };
    const result = buildLocalChecks({ result149, egrul });
    expect(result.find(c => c.id === 'law149').status).toBe('violation');
  });
});

describe('buildLocalChecks — ЕРИР', () => {
  it('no ad content → status ok with no-ads message', () => {
    const resultERIR = { status: 'ok', hasAdContent: false, items: [] };
    const result = buildLocalChecks({ resultERIR });
    expect(result.find(c => c.id === 'erir').status).toBe('ok');
  });

  it('ad content violation passes through', () => {
    const resultERIR = {
      status: 'violation',
      hasAdContent: true,
      items: [
        { id: 'erid', label: 'ERID-токен', present: false },
        { id: 'label', label: 'Метка «реклама»', present: false },
      ],
    };
    const result = buildLocalChecks({ resultERIR });
    expect(result.find(c => c.id === 'erir').status).toBe('violation');
  });
});

describe('buildLocalChecks — оферта', () => {
  it('non-commercial site → offer ok', () => {
    const resultOffer = { status: 'ok', isCommercial: false, kind: null, items: [] };
    const result = buildLocalChecks({ resultOffer });
    expect(result.find(c => c.id === 'offer').status).toBe('ok');
  });

  it('commercial violation passes through', () => {
    const resultOffer = {
      status: 'violation',
      isCommercial: true,
      kind: 'ecommerce',
      items: [{ id: 'offer_exists', label: 'Оферта', present: false }],
    };
    const result = buildLocalChecks({ resultOffer });
    expect(result.find(c => c.id === 'offer').status).toBe('violation');
  });
});
