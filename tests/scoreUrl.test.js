import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let scoreUrl;
beforeAll(() => { scoreUrl = loadScript().exports.scoreUrl; });

describe('scoreUrl', () => {
  it('scores homepage as 7', () => {
    expect(scoreUrl('https://example.com/')).toBe(7);
  });

  it('scores content (blog/news/article) as 10', () => {
    expect(scoreUrl('https://example.com/blog/post-1')).toBe(10);
    expect(scoreUrl('https://example.com/news/today')).toBe(10);
    expect(scoreUrl('https://example.com/article/12')).toBe(10);
    expect(scoreUrl('https://example.com/новости/материал')).toBe(10);
  });

  it('scores corporate pages as 5', () => {
    expect(scoreUrl('https://example.com/about')).toBe(5);
    expect(scoreUrl('https://example.com/privacy-policy')).toBe(5);
    expect(scoreUrl('https://example.com/offer')).toBe(5);
    expect(scoreUrl('https://example.com/контакты')).toBe(5);
  });

  it('scores generic page as 3', () => {
    expect(scoreUrl('https://example.com/random-path')).toBe(3);
  });

  it('skips cart, checkout, login (-1)', () => {
    expect(scoreUrl('https://example.com/cart')).toBe(-1);
    expect(scoreUrl('https://example.com/checkout')).toBe(-1);
    expect(scoreUrl('https://example.com/login')).toBe(-1);
  });

  it('skips search/filter/tag pages (-1)', () => {
    expect(scoreUrl('https://example.com/search')).toBe(-1);
    expect(scoreUrl('https://example.com/tag/foo')).toBe(-1);
    expect(scoreUrl('https://example.com/category/sport')).toBe(-1);
  });

  it('skips catalog/product/shop (-1)', () => {
    expect(scoreUrl('https://example.com/products')).toBe(-1);
    expect(scoreUrl('https://example.com/catalog')).toBe(-1);
    expect(scoreUrl('https://example.com/каталог/обувь')).toBe(-1);
  });

  it('skips technical paths (-1)', () => {
    expect(scoreUrl('https://example.com/api/users')).toBe(-1);
    expect(scoreUrl('https://example.com/wp-admin')).toBe(-1);
    expect(scoreUrl('https://example.com/sitemap.xml')).toBe(-1);
  });

  it('skips URLs with >=2 query params (-1)', () => {
    expect(scoreUrl('https://example.com/page?a=1&b=2')).toBe(-1);
    expect(scoreUrl('https://example.com/page?utm_source=x&utm_medium=y')).toBe(-1);
  });

  it('detects year-in-path as HIGH', () => {
    expect(scoreUrl('https://example.com/2024/03/some-story')).toBe(10);
    expect(scoreUrl('https://example.com/2023-05/digest')).toBe(10);
  });

  it('returns 3 for malformed URLs', () => {
    expect(scoreUrl('not-a-url')).toBe(3);
  });
});
