import { describe, it, expect, afterEach } from 'vitest';
import { loadScript } from './loadScript.js';

// Each test gets its own script instance to avoid shared-state issues.
// setScanCancelled resets between test cases via afterEach.

describe('scanCancelled — cancellation propagation', () => {
  describe('fetchUrl', () => {
    it('returns ok:false immediately when scanCancelled is true', async () => {
      const { exports: { fetchUrl, setScanCancelled }, gm } = loadScript({
        gmRoutes: [{ match: () => true, response: { status: 200, responseText: '<html><body>hi</body></html>' } }],
      });
      setScanCancelled(true);
      const r = await fetchUrl('https://example.com/');
      expect(r.ok).toBe(false);
      expect(gm.calls).toHaveLength(0); // no HTTP call made
    });

    it('fetches normally when scanCancelled is false', async () => {
      const { exports: { fetchUrl, setScanCancelled }, gm } = loadScript({
        gmRoutes: [{ match: () => true, response: { status: 200, responseText: '<html><body>ok</body></html>' } }],
      });
      setScanCancelled(false);
      const r = await fetchUrl('https://example.com/');
      expect(r.ok).toBe(true);
      expect(gm.calls).toHaveLength(1);
    });
  });

  describe('checkWithSleza', () => {
    it('returns errors:cancelled immediately when scanCancelled is true', async () => {
      const { exports: { checkWithSleza, setScanCancelled }, gm } = loadScript({
        gmValues: { SLEZA_KEY: 'test-key' },
        gmRoutes: [{ match: () => true, response: { status: 200, responseText: '{"found":0,"items":[]}' } }],
      });
      setScanCancelled(true);
      const r = await checkWithSleza('some text');
      expect(r.errors).toBe('cancelled');
      expect(gm.calls).toHaveLength(0);
    });
  });

  describe('checkEgrul', () => {
    it('returns null immediately when scanCancelled is true', async () => {
      const { exports: { checkEgrul, setScanCancelled }, gm } = loadScript({
        gmRoutes: [{ match: () => true, response: { status: 200, responseText: '{}' } }],
      });
      setScanCancelled(true);
      const r = await checkEgrul('7707083893');
      expect(r).toBeNull();
      expect(gm.calls).toHaveLength(0);
    });
  });
});
