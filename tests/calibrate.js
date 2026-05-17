#!/usr/bin/env node
/**
 * Калибровка локальных чек-листов на живых страницах через Playwright.
 * НЕ задействует Sleza, ЕГРЮЛ, AI — только детерминированную часть.
 *
 * Использует headless Chromium для рендера SPA (snob, vc, rbc и т.п.) —
 * имитирует то, что видит Tampermonkey на полностью загруженной странице.
 *
 * Первый запуск: `npx playwright install chromium` (~150МБ, разово).
 * Дальше:        `node tests/calibrate.js` [url ...]
 */
import { loadScript } from './loadScript.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  console.error('\n✗ Playwright не установлен. Запусти:\n    npm install\n    npx playwright install chromium\n');
  process.exit(1);
}

const DEFAULT_TARGETS = [
  { url: 'https://snob.ru/',                        kind: 'home',   site: 'snob.ru' },
  { url: 'https://snob.ru/static-pages/privacy/',   kind: 'policy', site: 'snob.ru' },
  { url: 'https://vc.ru/',                          kind: 'home',   site: 'vc.ru' },
  { url: 'https://www.rbc.ru/',                     kind: 'home',   site: 'rbc.ru' },
];

const argv = process.argv.slice(2);
const targets = argv.length
  ? argv.map(u => ({
      url: u,
      kind: u.match(/privac|policy|конфиденц|persondata/i) ? 'policy' : 'home',
      site: new URL(u).hostname,
    }))
  : DEFAULT_TARGETS;

const fmt = {
  ok:        '\x1b[32m✓\x1b[0m',
  miss:      '\x1b[31m✗\x1b[0m',
  risk:      '\x1b[33m⚠\x1b[0m',
  violation: '\x1b[31m✗\x1b[0m',
  unknown:   '?',
  no_policy: '—',
};
const status = (s) => `${fmt[s] || '?'} \x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function renderPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ru-RU',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.5',
      'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  });
  // Маскируем webdriver-флаг, который Cloudflare/Akamai используют для блокировки headless.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch (_) {}

    // Скроллим до конца страницы порциями — на SPA footer рендерится lazy, в Tampermonkey
    // пользователь обычно уже долистал. Без этого подвал с ИНН/ОГРН в HTML не попадает.
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let prev = 0;
      for (let i = 0; i < 20; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(250);
        if (document.body.scrollHeight === prev) break;
        prev = document.body.scrollHeight;
      }
      window.scrollTo(0, 0);
      await sleep(200);
    });

    const html = await page.content();
    const text = await page.evaluate(() => document.body?.innerText || '');
    return { ok: true, status: resp?.status() ?? 0, html, text };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  } finally {
    await ctx.close();
  }
}

const { exports: api } = loadScript();

console.log('\n══════════════ КАЛИБРОВКА ЛОКАЛЬНЫХ ЧЕКОВ ══════════════');
console.log(dim(`Playwright/Chromium headless. Цель: воспроизвести то, что видит Tampermonkey.`));
console.log('');

const browser = await chromium.launch({ headless: true });

try {
  for (const t of targets) {
    console.log(`▶ ${t.site.padEnd(14)} ${dim(t.url)}`);
    const r = await renderPage(browser, t.url);
    if (!r.ok) {
      console.log(`  ${fmt.miss} render failed: ${r.error}\n`);
      continue;
    }
    console.log(`  ${dim(`HTTP ${r.status}, rendered ${r.text.length.toLocaleString()} chars`)}`);

    if (t.kind === 'policy') {
      const r152 = api.check152FZ(r.text);
      console.log(`  152-ФЗ ${status(r152.status)} ${r152.found}/${r152.total}`);
      for (const i of r152.items) {
        console.log(`    ${i.present ? fmt.ok : fmt.miss} ${i.label}`);
      }
    } else {
      const r149  = api.check149FZ(r.text);
      const ids   = api.extractIdentifiers(r.text);
      const erir  = api.checkERIR(r.text);
      const offer = api.checkOffer(r.text, []);
      const drugs = api.checkDrugs(r.text);
      const lower = r.text.toLowerCase();
      const policyHasCookies = /cookie|куки|файл[ы]?\s+cookie/i.test(lower);
      const cookie = api.checkCookieCompliance({
        hasTracking: /yandex_metrika|mc\.yandex|ga\.js|analytics\.js|gtag|googletagmanager|fbevents/i.test(r.html || ''),
        hasCookieBanner: /cookie.{0,40}(банн|согласи|accept|принимаю)|принять.{0,20}cookie/i.test(r.text),
        policyHasCookies,
      });

      console.log(`  149-ФЗ ${status(r149.status)} ${r149.found}/${r149.total}` +
        (ids.inn  ? `  ${dim(`ИНН ${ids.inn}`)}`   : '') +
        (ids.ogrn ? `  ${dim(`ОГРН ${ids.ogrn}`)}` : '') +
        (ids.type ? `  ${dim(`(${ids.type})`)}`    : ''));
      for (const i of r149.items) {
        console.log(`    ${i.present ? fmt.ok : fmt.miss} ${i.label}`);
      }
      console.log(`  ЕРИР    ${status(erir.status)}  ${dim(`hasAdContent=${erir.hasAdContent}, found ${erir.found}/${erir.total}`)}`);
      console.log(`  Оферта  ${status(offer.status)}  ${dim(`isCommercial=${offer.isCommercial}${offer.kind ? `, kind=${offer.kind}` : ''}, ${offer.found}/${offer.total}`)}`);
      console.log(`  Cookie  ${status(cookie.status)}  ${dim(cookie.title)}`);
      console.log(`  Drugs   ${status(drugs.status)}  ${dim(drugs.hasMentions ? `${drugs.totalMentions} упоминаний, ${drugs.withoutContext} без контекста` : 'нет упоминаний')}`);
    }
    console.log('');
  }
} finally {
  await browser.close();
}
