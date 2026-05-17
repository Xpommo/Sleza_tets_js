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
  // 152-ФЗ: эталонная политика
  { url: 'https://snob.ru/static-pages/privacy/',   kind: 'policy', site: 'snob.ru' },
  // 149-ФЗ: страницы где должны быть реквизиты владельца сайта
  { url: 'https://snob.ru/static-pages/about/',     kind: 'home',   site: 'snob.ru/about' },
  { url: 'https://snob.ru/',                        kind: 'home',   site: 'snob.ru' },
  // vc.ru — проверяем false positive на оферту (ecommerce vs media)
  { url: 'https://vc.ru/',                          kind: 'home',   site: 'vc.ru' },
  // Сайт с гарантированно полным footer (yandex.ru/legal — статический HTML)
  { url: 'https://yandex.ru/legal/confidential/',   kind: 'policy', site: 'yandex.ru' },
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
    // Скрипт в TM пулит <footer> отдельно — делаем то же, чтобы реквизиты из подвала
    // не терялись если innerText body почему-то их обрезает.
    const footerText = await page.evaluate(() => {
      const f = document.querySelector('footer,#footer,.footer,[class*="footer"]');
      return f ? (f.innerText || f.textContent || '').slice(0, 5000) : '';
    });
    // Полный текст из HTML по тому же алгоритму что fetchUrl в скрипте —
    // включает hidden/below-the-fold элементы, которые innerText пропускает.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    // Склеиваем все три источника (как делает скрипт: header + body + footer).
    // Дубли не мешают — regex одинаково матчатся, а footer-текст из отдельного DOM-узла
    // часто не попадает в innerText (display:none или sticky positioning).
    const combined = [text, footerText, stripped].filter(Boolean).join('\n\n');
    return { ok: true, status: resp?.status() ?? 0, html, text: combined, innerText: text, footerText, stripped };
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
    console.log(`  ${dim(`HTTP ${r.status}, innerText=${r.innerText.length}, footer=${r.footerText.length}, stripped=${r.stripped.length} → using ${r.text.length} chars`)}`);

    if (t.kind === 'policy') {
      const r152 = api.check152FZ(r.text);
      console.log(`  152-ФЗ ${status(r152.status)} ${r152.found}/${r152.total}`);
      for (const i of r152.items) {
        console.log(`    ${i.present ? fmt.ok : fmt.miss} ${i.label}`);
      }
      // Для пропущенных пунктов ищем релевантные ключевики в тексте и печатаем
      // окно ±120 симв. — видно ЧТО именно сайт пишет про этот аспект и почему
      // наш regex это пропустил.
      const probes = {
        categories:     /категори[яийюях]+/i,
        purposes:       /цел[ьейяиюях]+/i,
        legal_basis:    /основан/i,
        storage_term:   /(срок|хран|удал|уничтож|период)/i,
        subject_rights: /(прав[аоеыхими]+\s+субъект|отзыв|вправе|потребова|удалит|изменит)/i,
        contact:        /(контакт|связ[аь]|оператор|ответствен|email|e-?mail|почт)/i,
        third_parties:  /(треть|сторон|партн|передач)/i,
      };
      const missing = r152.items.filter(i => !i.present);
      for (const m of missing) {
        const re = probes[m.id];
        if (!re) continue;
        const matches = [...r.text.matchAll(new RegExp(re.source, 'gi'))].slice(0, 3);
        if (matches.length === 0) {
          console.log(`    ${dim(`└ ${m.id}: ключевиков не нашлось вовсе → раздел реально отсутствует`)}`);
          continue;
        }
        console.log(`    ${dim(`└ ${m.id}: что говорит сайт (${matches.length} места):`)}`);
        for (const mm of matches) {
          const start = Math.max(0, mm.index - 80);
          const end = Math.min(r.text.length, mm.index + 200);
          const snippet = r.text.slice(start, end).replace(/\s+/g, ' ').trim();
          console.log(`      ${dim('…' + snippet + '…')}`);
        }
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
      // Если коммерческий определён — покажем какие фразы это спровоцировали (для отладки false positive).
      if (offer.isCommercial) {
        const sample = r.text.toLowerCase();
        const probes = {
          'купить':           /(?:^|[^а-яёa-z0-9_])купить(?=[^а-яёa-z0-9_]|$)/i,
          'корзина':          /(?:^|[^а-яёa-z0-9_])корзин[аеуыой](?=[^а-яёa-z0-9_]|$)/i,
          'цена/руб/₽':       /(\d+[\s\-]*₽|\d+[\s\-]*руб)/i,
          'доставка':         /(?:^|[^а-яёa-z0-9_])(доставка|курьер|самовывоз)(?=[^а-яёa-z0-9_]|$)/i,
          'интернет-магазин': /интернет[\-\s]?магазин/i,
          'тариф/подписка':   /(?:^|[^а-яёa-z0-9_])(тариф|подписка|абонемент)[а-яё]*(?=[^а-яёa-z0-9_]|$)/i,
          'исполнитель':      /(?:^|[^а-яёa-z0-9_])исполнител[ьяюуео]+(?=[^а-яёa-z0-9_]|$)/i,
        };
        const hits = Object.entries(probes).filter(([_, re]) => re.test(sample)).map(([k]) => k);
        if (hits.length) console.log(`    ${dim(`триггеры: ${hits.join(', ')}`)}`);
      }
      console.log(`  Cookie  ${status(cookie.status)}  ${dim(cookie.title)}`);
      console.log(`  Drugs   ${status(drugs.status)}  ${dim(drugs.hasMentions ? `${drugs.totalMentions} упоминаний, ${drugs.withoutContext} без контекста` : 'нет упоминаний')}`);
    }
    console.log('');
  }
} finally {
  await browser.close();
}
