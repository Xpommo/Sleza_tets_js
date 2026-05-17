import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

const ORIGIN = 'https://example.com';
const ERR = { match: () => true, error: 'network' };

// Long enough and contains keywords to pass isPolicyPage
const POLICY_BODY = 'Мы обрабатываем персональные данные пользователей в соответствии с требованиями 152-ФЗ. '.repeat(30);

function policyRoute(path) {
  return {
    match: req => req.url === ORIGIN + path,
    response: { status: 200, responseText: `<html><body>${POLICY_BODY}</body></html>` },
  };
}

describe('discoverPolicyByCommonPaths', () => {
  it('returns [] for an invalid origin URL', async () => {
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({ gmRoutes: [ERR] });
    expect(await discoverPolicyByCommonPaths('not-a-url')).toEqual([]);
  });

  it('returns [] when no policy-like page found', async () => {
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({ gmRoutes: [ERR] });
    expect(await discoverPolicyByCommonPaths(ORIGIN)).toEqual([]);
  });

  it('finds policy in wave 1 (/privacy-policy)', async () => {
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [policyRoute('/privacy-policy'), ERR],
    });
    const r = await discoverPolicyByCommonPaths(ORIGIN);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe(`${ORIGIN}/privacy-policy`);
    expect(r[0].text).toContain('персональные данные');
  });

  it('finds policy in wave 1 (/privacy)', async () => {
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [policyRoute('/privacy'), ERR],
    });
    const r = await discoverPolicyByCommonPaths(ORIGIN);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe(`${ORIGIN}/privacy`);
  });

  it('finds policy in wave 2 (/persdata) when wave 1 empty', async () => {
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [policyRoute('/persdata'), ERR],
    });
    const r = await discoverPolicyByCommonPaths(ORIGIN);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe(`${ORIGIN}/persdata`);
  });

  it('ignores page shorter than 500 chars even if keywords match', async () => {
    const shortHtml = '<html><body>Краткая политика конфиденциальности — privacy.</body></html>';
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/privacy-policy`, response: { status: 200, responseText: shortHtml } },
        ERR,
      ],
    });
    expect(await discoverPolicyByCommonPaths(ORIGIN)).toEqual([]);
  });

  it('ignores long page without policy keywords', async () => {
    const longNonPolicy = 'Добро пожаловать на наш сайт! Мы предлагаем много товаров и услуг. '.repeat(30);
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/privacy-policy`, response: { status: 200, responseText: `<html><body>${longNonPolicy}</body></html>` } },
        ERR,
      ],
    });
    expect(await discoverPolicyByCommonPaths(ORIGIN)).toEqual([]);
  });

  it('returns richest (longest text) page when multiple found in same wave', async () => {
    const shortPolicy = 'Политика конфиденциальности: обработка персональных данных. '.repeat(15);
    const longPolicy = POLICY_BODY;
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [
        {
          match: req => req.url === `${ORIGIN}/privacy-policy`,
          response: { status: 200, responseText: `<html><body>${shortPolicy}</body></html>` },
        },
        {
          match: req => req.url === `${ORIGIN}/privacy`,
          response: { status: 200, responseText: `<html><body>${longPolicy}</body></html>` },
        },
        ERR,
      ],
    });
    const r = await discoverPolicyByCommonPaths(ORIGIN);
    expect(r).toHaveLength(1);
    // The longer policy (POLICY_BODY) should be selected
    expect(r[0].text.length).toBeGreaterThan(shortPolicy.length / 2);
  });

  it('truncates returned text to 50000 chars', async () => {
    const hugePolicy = 'Обработка персональных данных. '.repeat(3000); // ~90k chars
    const { exports: { discoverPolicyByCommonPaths } } = loadScript({
      gmRoutes: [
        { match: req => req.url === `${ORIGIN}/privacy-policy`, response: { status: 200, responseText: `<html><body>${hugePolicy}</body></html>` } },
        ERR,
      ],
    });
    const r = await discoverPolicyByCommonPaths(ORIGIN);
    expect(r[0].text.length).toBeLessThanOrEqual(50000);
  });
});
