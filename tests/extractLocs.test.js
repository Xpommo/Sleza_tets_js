import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let extractLocs;
beforeAll(() => { extractLocs = loadScript().exports.extractLocs; });

describe('extractLocs', () => {
  it('extracts plain <loc> URLs', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/page1</loc></url>
      <url><loc>https://example.com/page2</loc></url>
    </urlset>`;
    expect(extractLocs(xml)).toEqual(['https://example.com/page1', 'https://example.com/page2']);
  });

  it('extracts CDATA-wrapped <loc> URLs', () => {
    const xml = `<urlset>
      <url><loc><![CDATA[https://example.com/cdata-page]]></loc></url>
    </urlset>`;
    expect(extractLocs(xml)).toEqual(['https://example.com/cdata-page']);
  });

  it('handles mixed plain and CDATA <loc> in the same document', () => {
    const xml = `<urlset>
      <url><loc>https://example.com/normal</loc></url>
      <url><loc><![CDATA[https://example.com/cdata]]></loc></url>
    </urlset>`;
    const result = extractLocs(xml);
    expect(result).toContain('https://example.com/normal');
    expect(result).toContain('https://example.com/cdata');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no <loc> elements present', () => {
    expect(extractLocs('<urlset><url><priority>0.5</priority></url></urlset>')).toEqual([]);
  });

  it('trims whitespace from extracted URLs', () => {
    const xml = '<urlset><url><loc>  https://example.com/trimmed  </loc></url></urlset>';
    expect(extractLocs(xml)).toEqual(['https://example.com/trimmed']);
  });

  it('handles multi-line CDATA content', () => {
    const xml = `<urlset><url><loc><![CDATA[
https://example.com/multiline
]]></loc></url></urlset>`;
    const result = extractLocs(xml);
    expect(result[0]).toContain('example.com/multiline');
  });
});
