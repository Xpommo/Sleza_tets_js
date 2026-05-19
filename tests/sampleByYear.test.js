import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let extractYearFromUrl, strideSample, sampleByYear;
beforeAll(() => {
  ({ extractYearFromUrl, strideSample, sampleByYear } = loadScript().exports);
});

describe('extractYearFromUrl', () => {
  it('extracts year from path segment /2020/', () => {
    expect(extractYearFromUrl('https://site.ru/2020/article')).toBe(2020);
  });
  it('extracts year from date-like slug 2019-05-15', () => {
    expect(extractYearFromUrl('https://site.ru/article-2019-05-15/')).toBe(2019);
  });
  it('extracts year from query param ?date=2018-01', () => {
    expect(extractYearFromUrl('https://site.ru/page?date=2018-01-01')).toBe(2018);
  });
  it('returns null when no year in URL', () => {
    expect(extractYearFromUrl('https://site.ru/about')).toBeNull();
  });
  it('returns null for year < 2010', () => {
    expect(extractYearFromUrl('https://site.ru/2009/article')).toBeNull();
  });
  it('returns null for year > 2030', () => {
    expect(extractYearFromUrl('https://site.ru/2035/article')).toBeNull();
  });
  it('accepts 2010 (lower boundary)', () => {
    expect(extractYearFromUrl('https://site.ru/2010/post')).toBe(2010);
  });
  it('accepts 2030 (upper boundary)', () => {
    expect(extractYearFromUrl('https://site.ru/2030/post')).toBe(2030);
  });
});

describe('strideSample', () => {
  it('returns copy when arr.length <= n', () => {
    const arr = ['a', 'b', 'c'];
    const result = strideSample(arr, 5);
    expect(result).toEqual(arr);
    expect(result).not.toBe(arr);
  });

  it('picks evenly spaced elements for n=3 of 6', () => {
    // step = 6/3 = 2 → indices floor(0), floor(2), floor(4)
    expect(strideSample(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toEqual(['a', 'c', 'e']);
  });

  it('returns single first element for n=1', () => {
    expect(strideSample(['x', 'y', 'z'], 1)).toEqual(['x']);
  });

  it('returns all when arr.length === n', () => {
    expect(strideSample(['a', 'b'], 2)).toEqual(['a', 'b']);
  });
});

describe('sampleByYear', () => {
  it('returns copy when urls.length <= budget', () => {
    const urls = ['https://site.ru/2020/a', 'https://site.ru/2021/b'];
    const result = sampleByYear(urls, 10);
    expect(result).toEqual(urls);
  });

  it('falls back to stride when < 3 distinct years', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://site.ru/2020/article-${i}`);
    const result = sampleByYear(urls, 3);
    expect(result).toHaveLength(3);
  });

  it('caps result at budget when >= 3 years present', () => {
    const urls = [
      ...Array.from({ length: 8 }, (_, i) => `https://site.ru/2020/a${i}`),
      ...Array.from({ length: 8 }, (_, i) => `https://site.ru/2021/b${i}`),
      ...Array.from({ length: 8 }, (_, i) => `https://site.ru/2022/c${i}`),
    ];
    const result = sampleByYear(urls, 6);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('includes URLs from all years when budget allows', () => {
    const urls = [
      ...Array.from({ length: 5 }, (_, i) => `https://site.ru/2020/a${i}`),
      ...Array.from({ length: 5 }, (_, i) => `https://site.ru/2021/b${i}`),
      ...Array.from({ length: 5 }, (_, i) => `https://site.ru/2022/c${i}`),
    ];
    const result = sampleByYear(urls, 9);
    const years = new Set(result.map(u => extractYearFromUrl(u)));
    expect(years.has(2020)).toBe(true);
    expect(years.has(2021)).toBe(true);
    expect(years.has(2022)).toBe(true);
  });
});
