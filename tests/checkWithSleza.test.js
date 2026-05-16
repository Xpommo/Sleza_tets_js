import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const SLEZA_URL = 'https://sleza.media/api/parse';

describe('checkWithSleza — under mocked GM_xmlhttpRequest', () => {
  it('returns no_key when SLEZA_KEY is empty', async () => {
    const { exports: { checkWithSleza }, gm } = loadScript({ gmValues: { SLEZA_KEY: '' } });
    const r = await checkWithSleza('some text');
    expect(r.errors).toBe('no_key');
    expect(gm.calls).toHaveLength(0);
  });

  it('passes Authorization header when SLEZA_KEY is set', async () => {
    const { exports: { checkWithSleza }, gm } = loadScript({
      gmValues: { SLEZA_KEY: 'sleza-abc-123' },
      gmRoutes: [
        {
          match: (req) => req.url === SLEZA_URL,
          response: { status: 200, responseText: JSON.stringify({ found: 0, items: [] }) },
        },
      ],
    });
    await checkWithSleza('lorem ipsum');
    expect(gm.calls).toHaveLength(1);
    expect(gm.calls[0].headers.Authorization).toBe('Bearer sleza-abc-123');
    expect(gm.calls[0].method).toBe('POST');
  });

  it('returns errors:net on network failure', async () => {
    const { exports: { checkWithSleza } } = loadScript({
      gmValues: { SLEZA_KEY: 'k' },
      gmRoutes: [{ match: () => true, error: 'network' }],
    });
    const r = await checkWithSleza('text');
    expect(r.errors).toBe('net');
  });

  it('returns errors:timeout on timeout', async () => {
    const { exports: { checkWithSleza } } = loadScript({
      gmValues: { SLEZA_KEY: 'k' },
      gmRoutes: [{ match: () => true, error: 'timeout' }],
    });
    const r = await checkWithSleza('text');
    expect(r.errors).toBe('timeout');
  });

  it('returns errors:parse_http_<status> for bad JSON', async () => {
    const { exports: { checkWithSleza } } = loadScript({
      gmValues: { SLEZA_KEY: 'k' },
      gmRoutes: [{ match: () => true, response: { status: 500, responseText: 'oops' } }],
    });
    const r = await checkWithSleza('text');
    expect(String(r.errors)).toMatch(/^parse_http_/);
  });
});
