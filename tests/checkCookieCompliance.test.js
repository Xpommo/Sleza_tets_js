import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let checkCookieCompliance;
beforeAll(() => { checkCookieCompliance = loadScript().exports.checkCookieCompliance; });

describe('checkCookieCompliance', () => {
  it('returns ok when no tracking, regardless of banner', () => {
    const r = checkCookieCompliance({ hasTracking: false, hasCookieBanner: false, policyHasCookies: false });
    expect(r.status).toBe('ok');
    expect(r.title).toContain('Трекинг не обнаружен');
  });

  it('returns ok when tracking + banner present', () => {
    const r = checkCookieCompliance({ hasTracking: true, hasCookieBanner: true, policyHasCookies: false });
    expect(r.status).toBe('ok');
    expect(r.title).toContain('Баннер');
  });

  it('returns risk when tracking + policy mentions cookies but no banner', () => {
    const r = checkCookieCompliance({ hasTracking: true, hasCookieBanner: false, policyHasCookies: true });
    expect(r.status).toBe('risk');
  });

  it('returns violation when tracking, no banner, no cookie mention in policy', () => {
    const r = checkCookieCompliance({ hasTracking: true, hasCookieBanner: false, policyHasCookies: false });
    expect(r.status).toBe('violation');
  });

  it('returns risk when tracking + consent checkbox (no banner) — weaker than banner but better than nothing', () => {
    const r = checkCookieCompliance({ hasTracking: true, hasCookieBanner: false, policyHasCookies: false, hasConsentCheckbox: true });
    expect(r.status).toBe('risk');
    expect(r.title).toContain('форма с согласием');
  });

  it('banner takes priority over consent checkbox → ok', () => {
    const r = checkCookieCompliance({ hasTracking: true, hasCookieBanner: true, policyHasCookies: false, hasConsentCheckbox: true });
    expect(r.status).toBe('ok');
  });

  it('no tracking → ok even with consent checkbox', () => {
    const r = checkCookieCompliance({ hasTracking: false, hasCookieBanner: false, policyHasCookies: false, hasConsentCheckbox: true });
    expect(r.status).toBe('ok');
  });
});
