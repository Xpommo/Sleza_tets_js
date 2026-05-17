import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const URL = 'https://example.com/page';

describe('fetchUrl', () => {
  it('returns ok:true with html, stripped text, and extracted title', async () => {
    const html = '<html><head><title>My Page</title></head><body><p>Hello world</p></body></html>';
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: req => req.url === URL, response: { status: 200, responseText: html } }],
    });
    const r = await fetchUrl(URL);
    expect(r.ok).toBe(true);
    expect(r.url).toBe(URL);
    expect(r.title).toBe('My Page');
    expect(r.text).toContain('Hello world');
    expect(r.html).toBe(html);
  });

  it('strips <script> tags from text output', async () => {
    const html = '<html><body><script>eval("bad")</script><p>Content</p></body></html>';
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: html } }],
    });
    const r = await fetchUrl(URL);
    expect(r.text).not.toContain('eval');
    expect(r.text).toContain('Content');
  });

  it('strips <style> tags from text output', async () => {
    const html = '<html><body><style>.a { color: red; }</style><p>Text</p></body></html>';
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: html } }],
    });
    const r = await fetchUrl(URL);
    expect(r.text).not.toContain('color: red');
    expect(r.text).toContain('Text');
  });

  it('uses url as title fallback when <title> absent', async () => {
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: '<html><body>no title here</body></html>' } }],
    });
    const r = await fetchUrl(URL);
    expect(r.title).toBe(URL);
  });

  it('returns ok:false on network error', async () => {
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, error: 'network' }],
    });
    const r = await fetchUrl(URL);
    expect(r.ok).toBe(false);
    expect(r.html).toBe('');
    expect(r.text).toBe('');
  });

  it('returns ok:false on timeout', async () => {
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, error: 'timeout' }],
    });
    const r = await fetchUrl(URL);
    expect(r.ok).toBe(false);
  });

  it('decodes common HTML entities in text', async () => {
    const html = '<html><body><p>AT&amp;T &lt;test&gt; &quot;quoted&quot;</p></body></html>';
    const { exports: { fetchUrl } } = loadScript({
      gmRoutes: [{ match: () => true, response: { status: 200, responseText: html } }],
    });
    const r = await fetchUrl(URL);
    expect(r.text).toContain('AT&T');
    expect(r.text).toContain('<test>');
    expect(r.text).toContain('"quoted"');
  });
});
