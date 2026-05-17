import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function makeLocal(found, missingIds = []) {
  // 7 пунктов: missingIds — те, что present:false. Остальные — present:true (confirmedBy:'local').
  const all = ['categories', 'purposes', 'legal_basis', 'storage_term', 'subject_rights', 'contact', 'third_parties'];
  const items = all.map(id => ({
    id, label: id,
    present: !missingIds.includes(id),
    confirmedBy: !missingIds.includes(id) ? 'local' : null,
  }));
  return {
    items, found, total: 7,
    status: found >= 6 ? 'ok' : found >= 3 ? 'risk' : 'violation',
  };
}

function groqContent(obj) {
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] });
}

describe('verify152FZWithAI', () => {
  it('does NOT call AI when found >= 6 (no upgrade needed)', async () => {
    const { exports: { verify152FZWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const local = makeLocal(7);
    const r = await verify152FZWithAI('any policy text', local);
    expect(gm.calls).toHaveLength(0);
    expect(r).toBe(local);
  });

  it('does NOT call AI when found === 0', async () => {
    const { exports: { verify152FZWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const local = makeLocal(0, ['categories', 'purposes', 'legal_basis', 'storage_term', 'subject_rights', 'contact', 'third_parties']);
    const r = await verify152FZWithAI('any policy text', local);
    expect(gm.calls).toHaveLength(0);
    expect(r).toBe(local);
  });

  it('does NOT call AI when status === "no_policy"', async () => {
    const { exports: { verify152FZWithAI }, gm } = loadScript({ gmValues: { GROQ_KEY: 'gsk_x' } });
    const local = { items: [], found: 0, total: 7, status: 'no_policy' };
    const r = await verify152FZWithAI('any', local);
    expect(gm.calls).toHaveLength(0);
    expect(r).toBe(local);
  });

  it('upgrades found and flips status when AI confirms missing items', async () => {
    const aiPayload = groqContent({
      items: [
        { id: 'contact',       present: true,  quote: 'info@example.ru' },
        { id: 'third_parties', present: true,  quote: 'третьим лицам' },
      ],
    });
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: (req) => req.url === GROQ_URL, response: { status: 200, responseText: aiPayload } }],
    });
    const local = makeLocal(5, ['contact', 'third_parties']);
    const r = await verify152FZWithAI('policy text long enough', local);
    expect(r.found).toBe(7);
    expect(r.status).toBe('ok');
    expect(r.items.find(i => i.id === 'contact').confirmedBy).toBe('ai');
    expect(r.items.find(i => i.id === 'third_parties').confirmedBy).toBe('ai');
    expect(r.items.find(i => i.id === 'contact').quote).toContain('info@');
  });

  it('partial AI confirmation only upgrades confirmed items', async () => {
    const aiPayload = groqContent({
      items: [
        { id: 'contact',       present: true,  quote: 'mail@x.ru' },
        { id: 'third_parties', present: false, quote: '' },
      ],
    });
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: aiPayload } }],
    });
    const local = makeLocal(5, ['contact', 'third_parties']);
    const r = await verify152FZWithAI('policy text', local);
    expect(r.found).toBe(6);
    expect(r.status).toBe('ok');
    expect(r.items.find(i => i.id === 'third_parties').present).toBe(false);
  });

  it('keeps local result on network error (fail-safe)', async () => {
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, error: 'network' }],
    });
    const local = makeLocal(4, ['contact', 'third_parties', 'subject_rights']);
    const r = await verify152FZWithAI('policy text', local);
    expect(r).toBe(local);
    expect(r.found).toBe(4);
  });

  it('keeps local result on timeout', async () => {
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, error: 'timeout' }],
    });
    const local = makeLocal(4, ['contact', 'third_parties', 'subject_rights']);
    const r = await verify152FZWithAI('policy text', local);
    expect(r).toBe(local);
  });

  it('keeps local result on malformed JSON from Groq', async () => {
    const garbled = JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] });
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: garbled } }],
    });
    const local = makeLocal(4, ['contact', 'third_parties', 'subject_rights']);
    const r = await verify152FZWithAI('policy text', local);
    expect(r.found).toBe(4);
  });

  it('extracts JSON wrapped in code-fence prose', async () => {
    const fenced = JSON.stringify({
      choices: [{ message: { content: 'Конечно, вот ответ:\n```json\n{"items":[{"id":"contact","present":true,"quote":"@"}]}\n```' } }],
    });
    const { exports: { verify152FZWithAI } } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: fenced } }],
    });
    const local = makeLocal(5, ['contact', 'third_parties']);
    const r = await verify152FZWithAI('policy text', local);
    expect(r.items.find(i => i.id === 'contact').confirmedBy).toBe('ai');
  });

  it('sends model=llama-3.3-70b-versatile and temperature=0 in the request body', async () => {
    const okPayload = groqContent({ items: [] });
    const { exports: { verify152FZWithAI }, gm } = loadScript({
      gmValues: { GROQ_KEY: 'gsk_x' },
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: okPayload } }],
    });
    const local = makeLocal(5, ['contact', 'third_parties']);
    await verify152FZWithAI('policy text', local);
    expect(gm.calls).toHaveLength(1);
    const body = JSON.parse(gm.calls[0].data);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
    // Промпт содержит только missing items, не все 7
    expect(body.messages[1].content).toContain('contact');
    expect(body.messages[1].content).toContain('third_parties');
    expect(body.messages[1].content).not.toContain('- categories:');
  });
});
