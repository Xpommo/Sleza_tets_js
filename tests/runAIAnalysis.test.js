import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function makeContext(overrides = {}) {
  return {
    url: 'https://test-site.local/',
    title: 'Тестовый сайт',
    header: 'Шапка сайта',
    footer: 'Подвал: ООО Тест, ИНН 7707083893',
    bodyText: 'Полезный контент. ' + 'Лорем ипсум. '.repeat(20),
    hasAdScripts: false,
    hasCookieBanner: false,
    policyLinks: [],
    offerLinks: [],
    returnLinks: [],
    aboutLinks: [],
    ...overrides,
  };
}

const FALLBACK_404 = { match: () => true, response: { status: 404, responseText: 'Not Found' } };

describe('runAIAnalysis', () => {
  it('falls back to local-only checks when GROQ_KEY is empty', async () => {
    const { exports: { runAIAnalysis }, gm } = loadScript({
      gmValues: { GROQ_KEY: '' },
      gmRoutes: [FALLBACK_404], // discoverPolicyByCommonPaths probes 14 URLs
    });
    const r = await runAIAnalysis(makeContext(), { checked: false, ids: {} }, '');
    expect(r.summary).toContain('локальных');
    expect(Array.isArray(r.checks)).toBe(true);
    expect(r.result152).toBeDefined();
    expect(r.result149).toBeDefined();
    // Никакого вызова на api.groq.com
    expect(gm.calls.find(c => c.url === GROQ_URL)).toBeUndefined();
  });

  it('calls Groq once when GROQ_KEY is set and parses the response', async () => {
    const aiBody = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        site_name: 'Тест',
        site_type: 'media',
        summary: 'OK',
        checks: [{ law_code: '152-ФЗ', status: 'ok', issue: '', action: '', fine: '' }],
      }) } }],
    });
    const { exports: { runAIAnalysis }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_test' },
      gmRoutes: [
        { match: (req) => req.url === GROQ_URL, response: { status: 200, responseText: aiBody } },
        FALLBACK_404,
      ],
    });
    const r = await runAIAnalysis(makeContext(), { checked: false, ids: {} }, '');
    const groqCalls = gm.calls.filter(c => c.url === GROQ_URL);
    expect(groqCalls).toHaveLength(1);
    expect(groqCalls[0].headers.Authorization).toBe('Bearer gsk_test');
    expect(r.site_name).toBeDefined();
    expect(Array.isArray(r.checks)).toBe(true);
  });

  it('embeds ЕГРЮЛ verdict into the prompt when egrul.checked is true', async () => {
    const aiBody = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ site_name: '', site_type: '', summary: '', checks: [] }) } }],
    });
    const { exports: { runAIAnalysis }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_test' },
      gmRoutes: [
        { match: (req) => req.url === GROQ_URL, response: { status: 200, responseText: aiBody } },
        FALLBACK_404,
      ],
    });
    await runAIAnalysis(
      makeContext(),
      {
        checked: true,
        ids: { inn: '7707083893', ogrn: '1027700132195' },
        result: { found: true, parsed: { type: 'ul', name: 'ООО "Тест"', isActive: true, address: 'Москва', regDate: '2002' } },
      },
      ''
    );
    const groqCall = gm.calls.find(c => c.url === GROQ_URL);
    const body = JSON.parse(groqCall.data);
    const userMsg = body.messages.find(m => m.role === 'user').content;
    expect(userMsg).toContain('ПРОВЕРКА РЕКВИЗИТОВ ЧЕРЕЗ ЕГРЮЛ');
    expect(userMsg).toContain('7707083893');
    expect(userMsg).toContain('ДЕЙСТВУЮЩАЯ');
  });

  it('attaches local 149-ФЗ checklist into the prompt', async () => {
    const aiBody = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ site_name: '', site_type: '', summary: '', checks: [] }) } }],
    });
    const { exports: { runAIAnalysis }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [
        { match: (req) => req.url === GROQ_URL, response: { status: 200, responseText: aiBody } },
        FALLBACK_404,
      ],
    });
    await runAIAnalysis(makeContext(), { checked: false, ids: {} }, '');
    const body = JSON.parse(gm.calls.find(c => c.url === GROQ_URL).data);
    expect(body.messages[1].content).toContain('ЛОКАЛЬНЫЙ ЧЕК-ЛИСТ 149-ФЗ');
  });

  it('returns local-only fallback on Groq network error', async () => {
    const { exports: { runAIAnalysis } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [
        { match: (req) => req.url === GROQ_URL, error: 'network' },
        FALLBACK_404,
      ],
    });
    const r = await runAIAnalysis(makeContext(), { checked: false, ids: {} }, '');
    expect(r).toBeDefined();
    expect(r.result152).toBeDefined();
  });

  it('returns local-only fallback on malformed Groq response', async () => {
    const { exports: { runAIAnalysis } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [
        { match: (req) => req.url === GROQ_URL, response: { status: 200, responseText: 'not json' } },
        FALLBACK_404,
      ],
    });
    const r = await runAIAnalysis(makeContext(), { checked: false, ids: {} }, '');
    expect(r).toBeDefined();
    expect(r.result152).toBeDefined();
  });
});
