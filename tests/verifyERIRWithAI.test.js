import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function makeErir({ status = 'risk', hasAdScripts = true, hasAdMarkerInContent = false } = {}) {
  return {
    items: [
      { id: 'erid_token',      label: 'Токен ERID',     present: false },
      { id: 'ad_marker',       label: 'Метка реклама',  present: false },
      { id: 'advertiser_info', label: 'Рекламодатель',  present: false },
    ],
    found: 0, total: 3,
    status, hasAdContent: hasAdScripts || hasAdMarkerInContent,
    hasAdScripts, hasAdMarkerInContent,
  };
}

const PAGE_CTX = {
  url: 'https://callibri.ru',
  title: 'Callibri — коллтрекинг и аналитика',
  header: 'Callibri — сервис аналитики звонков для маркетологов',
  footer: 'ООО «Коллибри», ИНН 6670407585',
  bodyText: 'Callibri — B2B SaaS платформа для отслеживания звонков. Помогает маркетологам оптимизировать рекламные кампании.',
};

function groqSays(hasPaidAds, confidence = 'high', reason = '') {
  const content = JSON.stringify({ has_paid_advertising: hasPaidAds, confidence, reason });
  return JSON.stringify({ choices: [{ message: { content } }] });
}

describe('verifyERIRWithAI', () => {
  it('does NOT call AI when hasAdScripts=false (text-only detection, no ambiguity)', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir({ hasAdScripts: false, hasAdMarkerInContent: false, status: 'ok' }));
    expect(gm.calls).toHaveLength(0);
  });

  it('does NOT call AI when hasAdMarkerInContent=true (explicit text ad markers — real advertising)', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir({ hasAdScripts: true, hasAdMarkerInContent: true, status: 'risk' }));
    expect(gm.calls).toHaveLength(0);
  });

  it('does NOT call AI when status=ok', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir({ status: 'ok' }));
    expect(gm.calls).toHaveLength(0);
  });

  it('does NOT call AI when status=violation', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir({ status: 'violation' }));
    expect(gm.calls).toHaveLength(0);
  });

  it('calls AI for ambiguous case: hasAdScripts=true + no text markers + status=risk', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: req => req.url === GROQ_URL, response: { status: 200, responseText: groqSays(false) } }],
    });
    await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(gm.calls).toHaveLength(1);
  });

  it('returns status=ok when Groq says no paid advertising with high confidence', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: groqSays(false, 'high', 'SaaS аналитика') } }],
    });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(r.status).toBe('ok');
    expect(r.verifiedBy).toBe('ai');
    expect(r.aiReason).toContain('SaaS');
  });

  it('keeps status=risk when Groq says yes, there is paid advertising', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: groqSays(true, 'high') } }],
    });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(r.status).toBe('risk');
    expect(r.verifiedBy).toBeUndefined();
  });

  it('keeps status=risk when Groq says no ads but confidence is low', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: groqSays(false, 'low') } }],
    });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(r.status).toBe('risk');
  });

  it('keeps status=risk when Groq says no ads but confidence is medium', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: groqSays(false, 'medium') } }],
    });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(r.status).toBe('risk');
  });

  it('returns original on network error (fail-safe)', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, error: 'network' }],
    });
    const orig = makeErir();
    const r = await verifyERIRWithAI(PAGE_CTX, orig);
    expect(r).toBe(orig);
  });

  it('returns original on timeout', async () => {
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, error: 'timeout' }],
    });
    const orig = makeErir();
    const r = await verifyERIRWithAI(PAGE_CTX, orig);
    expect(r).toBe(orig);
  });

  it('returns original on malformed JSON from Groq', async () => {
    const bad = JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] });
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: bad } }],
    });
    const orig = makeErir();
    const r = await verifyERIRWithAI(PAGE_CTX, orig);
    expect(r).toBe(orig);
  });

  it('extracts JSON wrapped in code-fence prose', async () => {
    const fenced = JSON.stringify({
      choices: [{ message: { content: 'Анализ:\n```json\n{"has_paid_advertising":false,"confidence":"high","reason":"SaaS"}\n```' } }],
    });
    const { exports: { verifyERIRWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: fenced } }],
    });
    const r = await verifyERIRWithAI(PAGE_CTX, makeErir());
    expect(r.status).toBe('ok');
  });

  it('sends model=llama-3.3-70b-versatile and temperature=0', async () => {
    const { exports: { verifyERIRWithAI }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: groqSays(false) } }],
    });
    await verifyERIRWithAI(PAGE_CTX, makeErir());
    const body = JSON.parse(gm.calls[0].data);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain('callibri.ru');
  });
});
