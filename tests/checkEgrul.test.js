import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

describe('checkEgrul — under mocked GM_xmlhttpRequest', () => {
  it('returns parsed data for a 200 response', async () => {
    const { exports: { checkEgrul }, gm } = loadScript({
      gmRoutes: [
        {
          match: (req) => req.url.includes('egrul.org/7707083893'),
          response: {
            status: 200,
            responseText: JSON.stringify({
              СвЮЛ: { НаимЮЛПолн: 'ООО "Тест"', ИНН: '7707083893', ОГРН: '1027700132195' },
            }),
          },
        },
      ],
    });
    const r = await checkEgrul('7707083893');
    expect(r.found).toBe(true);
    expect(r.parsed.name).toBe('ООО "Тест"');
    expect(r.parsed.isActive).toBe(true);
    expect(gm.calls).toHaveLength(1);
    expect(gm.calls[0].url).toContain('7707083893');
  });

  it('returns found:false with http_404 for 404', async () => {
    const { exports: { checkEgrul } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 404, responseText: 'Not found' } }],
    });
    const r = await checkEgrul('0000000000');
    expect(r.found).toBe(false);
    expect(r.error).toBe('http_404');
  });

  it('returns found:false with error:parse for invalid JSON', async () => {
    const { exports: { checkEgrul } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: 'not json' } }],
    });
    const r = await checkEgrul('7707083893');
    expect(r.found).toBe(false);
    expect(r.error).toBe('parse');
  });

  it('returns found:false with error:net on network failure', async () => {
    const { exports: { checkEgrul } } = loadScript({
      gmRoutes: [{ match: () => true, error: 'network' }],
    });
    const r = await checkEgrul('7707083893');
    expect(r.found).toBe(false);
    expect(r.error).toBe('net');
  });

  it('returns null without firing a request for empty identifier', async () => {
    const { exports: { checkEgrul }, gm } = loadScript();
    const r = await checkEgrul('');
    expect(r).toBeNull();
    expect(gm.calls).toHaveLength(0);
  });
});
