import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

describe('setHttpTransport', () => {
  it('replaces the HTTP transport used by fetchUrl', async () => {
    const { exports: { fetchUrl, setHttpTransport } } = loadScript({ gmRoutes: [] });

    const calls = [];
    setHttpTransport(req => {
      calls.push(req.url);
      queueMicrotask(() => req.onload({ status: 200, responseText: '<html><body>hi</body></html>' }));
      return { abort: () => {} };
    });

    const r = await fetchUrl('https://example.com/test');
    expect(calls).toEqual(['https://example.com/test']);
    expect(r.ok).toBe(true);
    expect(r.text).toContain('hi');
  });

  it('setKeyStore replaces key getter and setter', () => {
    const store = { GROQ_KEY: 'test-key' };
    const { exports: { setKeyStore, saveKeys } } = loadScript({ gmValues: {} });

    setKeyStore({
      get: (k, def) => (k in store ? store[k] : def),
      set: (k, v) => { store[k] = v; },
    });

    saveKeys('new-groq', 'new-sleza');
    expect(store.GROQ_KEY).toBe('new-groq');
    expect(store.SLEZA_KEY).toBe('new-sleza');
  });
});
