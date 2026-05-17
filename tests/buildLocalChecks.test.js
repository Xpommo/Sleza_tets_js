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
