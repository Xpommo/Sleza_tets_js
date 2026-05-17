#!/usr/bin/env node
/**
 * Калибровка: прогоняем все локальные чек-листы скрипта на живых страницах.
 * НЕ задействует Sleza, ЕГРЮЛ, AI — только детерминированную часть.
 * Запуск: node tests/calibrate.js [url1 url2 ...]
 */
import { loadScript } from './loadScript.js';

const DEFAULT_TARGETS = [
  // snob.ru: эталон, политика 7/7, в подвале реквизиты
  { url: 'https://snob.ru/',                        kind: 'home',   site: 'snob.ru' },
  { url: 'https://snob.ru/static-pages/privacy/',   kind: 'policy', site: 'snob.ru' },
  // vc.ru
  { url: 'https://vc.ru/',                          kind: 'home',   site: 'vc.ru' },
  { url: 'https://vc.ru/legal/privacy',             kind: 'policy', site: 'vc.ru' },
  // rbc.ru
  { url: 'https://www.rbc.ru/',                     kind: 'home',   site: 'rbc.ru' },
  { url: 'https://www.rbc.ru/static/privacy/',      kind: 'policy', site: 'rbc.ru' },
];

const argv = process.argv.slice(2);
const targets = argv.length
  ? argv.map(u => ({ url: u, kind: u.match(/privac|policy|конфиденц|persondata/i) ? 'policy' : 'home', site: new URL(u).hostname }))
  : DEFAULT_TARGETS;

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Sleza-Calibrator/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'ru,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    // Воспроизводим логику fetchUrl из script: вырезаем script/style/noscript, HTML-теги, нормализуем пробелы.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    return { ok: true, text, html, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

const { exports: api } = loadScript();
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

console.log('\n══════════════ КАЛИБРОВКА ЛОКАЛЬНЫХ ЧЕКОВ ══════════════\n');

for (const t of targets) {
  console.log(`▶ ${t.site.padEnd(12)} ${dim(t.url)}`);
  const r = await fetchText(t.url);
  if (!r.ok) {
    console.log(`  ${fmt.miss} fetch failed: ${r.error}\n`);
    continue;
  }
  const len = r.text.length;
  console.log(`  ${dim(`fetched ${len.toLocaleString()} chars`)}`);

  if (t.kind === 'policy') {
    const r152 = api.check152FZ(r.text);
    console.log(`  152-ФЗ ${status(r152.status)} ${r152.found}/${r152.total}`);
    for (const i of r152.items) {
      console.log(`    ${i.present ? fmt.ok : fmt.miss} ${i.label}`);
    }
  } else {
    // На главной/контентной странице — все остальные локальные чеки
    const r149 = api.check149FZ(r.text);
    const ids = api.extractIdentifiers(r.text);
    const erir = api.checkERIR(r.text);
    const offer = api.checkOffer(r.text, []);
    const drugs = api.checkDrugs(r.text);
    const policyHasCookies = /cookie|куки|файл[ы]?\s+cookie/i.test(r.text.toLowerCase());
    const cookie = api.checkCookieCompliance({
      hasTracking: /yandex_metrika|ga\.js|analytics\.js|gtag|googletagmanager|fbevents/i.test(r.html || ''),
      hasCookieBanner: /cookie.{0,40}(банн|согласи|accept|принимаю)|принять.{0,20}cookie/i.test(r.text),
      policyHasCookies,
    });

    console.log(`  149-ФЗ ${status(r149.status)} ${r149.found}/${r149.total}` +
      (ids.inn ? `  ${dim(`ИНН ${ids.inn}`)}` : '') +
      (ids.ogrn ? `  ${dim(`ОГРН ${ids.ogrn}`)}` : '') +
      (ids.type ? `  ${dim(`(${ids.type})`)}` : ''));
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
