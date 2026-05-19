import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const ORIGIN = 'https://example.com';
const OK = (html) => ({ status: 200, responseText: html });
const PAGE = '<html><body>page</body></html>';

describe('crawlSite', () => {
  it('returns {source:"crawl", urls} with the start URL', async () => {
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [{ match: () => true, response: OK(PAGE) }],
    });
    const r = await crawlSite(`${ORIGIN}/`, 10, 2, () => {});
    expect(r.source).toBe('crawl');
    expect(r.urls).toContain(`${ORIGIN}/`);
  });

  it('follows same-origin links and adds them to results', async () => {
    const homeHtml = `<html><body><a href="/about">About</a></body></html>`;
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/`, response: OK(homeHtml) },
        { match: () => true, response: OK(PAGE) },
      ],
    });
    const r = await crawlSite(`${ORIGIN}/`, 10, 2, () => {});
    expect(r.urls).toContain(`${ORIGIN}/about`);
  });

  it('does not follow off-origin links', async () => {
    const homeHtml = `<html><body><a href="https://other.com/page">Off-origin</a></body></html>`;
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [{ match: () => true, response: OK(homeHtml) }],
    });
    const r = await crawlSite(`${ORIGIN}/`, 10, 2, () => {});
    expect(r.urls).not.toContain('https://other.com/page');
  });

  it('respects maxPages limit', async () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('');
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [{ match: () => true, response: OK(`<html><body>${links}</body></html>`) }],
    });
    const r = await crawlSite(`${ORIGIN}/`, 3, 2, () => {});
    expect(r.urls.length).toBeLessThanOrEqual(3);
  });

  it('does not visit the same URL twice', async () => {
    // Both homepage and /page2 link to /shared — it should be fetched only once.
    const home = `<html><body><a href="/page2">p2</a><a href="/shared">s</a></body></html>`;
    const page2 = `<html><body><a href="/shared">s</a></body></html>`;
    const { exports: { crawlSite }, gm } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/`, response: OK(home) },
        { match: req => req.url === `${ORIGIN}/page2`, response: OK(page2) },
        { match: () => true, response: OK(PAGE) },
      ],
    });
    await crawlSite(`${ORIGIN}/`, 10, 2, () => {});
    const sharedFetches = gm.calls.filter(c => c.url === `${ORIGIN}/shared`);
    expect(sharedFetches.length).toBe(1);
  });

  it('respects maxDepth — does not crawl past specified depth', async () => {
    const home = `<html><body><a href="/level1">l1</a></body></html>`;
    const level1 = `<html><body><a href="/level2">l2</a></body></html>`;
    const { exports: { crawlSite }, gm } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/`, response: OK(home) },
        { match: req => req.url === `${ORIGIN}/level1`, response: OK(level1) },
        { match: () => true, response: OK(PAGE) },
      ],
    });
    await crawlSite(`${ORIGIN}/`, 10, 1, () => {});
    const fetched = gm.calls.map(c => c.url);
    expect(fetched).toContain(`${ORIGIN}/level1`);
    expect(fetched).not.toContain(`${ORIGIN}/level2`);
  });

  it('skips failed pages (network error) without stopping the crawl', async () => {
    const home = `<html><body><a href="/bad">bad</a><a href="/good">good</a></body></html>`;
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/`, response: OK(home) },
        { match: req => req.url === `${ORIGIN}/bad`, error: 'network' },
        { match: req => req.url === `${ORIGIN}/good`, response: OK(PAGE) },
      ],
    });
    const r = await crawlSite(`${ORIGIN}/`, 10, 2, () => {});
    expect(r.urls).toContain(`${ORIGIN}/`);
    expect(r.urls).toContain(`${ORIGIN}/good`);
    expect(r.urls).not.toContain(`${ORIGIN}/bad`);
  });

  it('calls onProgress with current/queued counts', async () => {
    const calls = [];
    const { exports: { crawlSite } } = loadScript({
      gmRoutes: [{ match: () => true, response: OK(PAGE) }],
    });
    await crawlSite(`${ORIGIN}/`, 3, 1, p => calls.push(p));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toMatchObject({ current: expect.any(Number), queued: expect.any(Number) });
  });
});
