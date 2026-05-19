import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const ORIGIN = 'https://example.com';
const ERR = { match: () => true, error: 'network' };

function route(path, xml) {
  return { match: req => req.url === ORIGIN + path, response: { status: 200, responseText: xml } };
}

describe('trySitemap', () => {
  it('returns null when no sitemap candidate responds', async () => {
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [ERR] });
    expect(await trySitemap(ORIGIN)).toBeNull();
  });

  it('returns {source:"sitemap", urls} for a simple sitemap.xml', async () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>${ORIGIN}/page1</loc></url>
      <url><loc>${ORIGIN}/page2</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    const r = await trySitemap(ORIGIN);
    expect(r.source).toBe('sitemap');
    expect(r.urls).toContain(`${ORIGIN}/page1`);
    expect(r.urls).toContain(`${ORIGIN}/page2`);
  });

  it('filters out non-HTML URLs (pdf, js) from sitemap', async () => {
    const xml = `<urlset>
      <url><loc>${ORIGIN}/page1</loc></url>
      <url><loc>${ORIGIN}/doc.pdf</loc></url>
      <url><loc>${ORIGIN}/app.js</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    const r = await trySitemap(ORIGIN);
    expect(r.urls).toEqual([`${ORIGIN}/page1`]);
  });

  it('filters out off-origin URLs', async () => {
    const xml = `<urlset>
      <url><loc>${ORIGIN}/local</loc></url>
      <url><loc>https://other.com/page</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    const r = await trySitemap(ORIGIN);
    expect(r.urls).toEqual([`${ORIGIN}/local`]);
  });

  it('deduplicates URLs listed multiple times', async () => {
    const xml = `<urlset>
      <url><loc>${ORIGIN}/page</loc></url>
      <url><loc>${ORIGIN}/page</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    const r = await trySitemap(ORIGIN);
    expect(r.urls).toHaveLength(1);
  });

  it('returns null when sitemap has <loc> but all URLs are filtered out', async () => {
    const xml = `<urlset><url><loc>${ORIGIN}/file.pdf</loc></url></urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    expect(await trySitemap(ORIGIN)).toBeNull();
  });

  it('follows sitemap-index sub-sitemaps → source: "sitemap-index"', async () => {
    const indexXml = `<sitemapindex>
      <sitemap><loc>${ORIGIN}/sitemap-posts.xml</loc></sitemap>
    </sitemapindex>`;
    const postsXml = `<urlset>
      <url><loc>${ORIGIN}/post/1</loc></url>
      <url><loc>${ORIGIN}/post/2</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({
      gmRoutes: [
        route('/sitemap.xml', indexXml),
        route('/sitemap-posts.xml', postsXml),
        ERR,
      ],
    });
    const r = await trySitemap(ORIGIN);
    expect(r.source).toBe('sitemap-index');
    expect(r.urls).toContain(`${ORIGIN}/post/1`);
    expect(r.urls).toContain(`${ORIGIN}/post/2`);
  });

  it('tries alternate sitemap paths when sitemap.xml absent', async () => {
    const xml = `<urlset><url><loc>${ORIGIN}/article/1</loc></url></urlset>`;
    // sitemap.xml → network error, sitemap_index.xml → has URLs
    const { exports: { trySitemap } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/sitemap.xml`, error: 'network' },
        route('/sitemap_index.xml', xml),
        ERR,
      ],
    });
    const r = await trySitemap(ORIGIN);
    expect(r).not.toBeNull();
    expect(r.urls).toContain(`${ORIGIN}/article/1`);
  });

  it('handles CDATA-wrapped <loc> elements', async () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc><![CDATA[${ORIGIN}/cdata-page]]></loc></url>
      <url><loc>${ORIGIN}/normal-page</loc></url>
    </urlset>`;
    const { exports: { trySitemap } } = loadScript({ gmRoutes: [route('/sitemap.xml', xml), ERR] });
    const r = await trySitemap(ORIGIN);
    expect(r.urls).toContain(`${ORIGIN}/cdata-page`);
    expect(r.urls).toContain(`${ORIGIN}/normal-page`);
  });
});
