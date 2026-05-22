# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Single-file Tampermonkey userscript at `./script` (~3400 lines, JS in a UserScript header + IIFE — no extension on purpose, that's what Tampermonkey imports). Alongside it: a vitest corpus under `tests/` that loads the script via `tests/loadScript.js` (Node `vm` context with shimmed `GM_*` and minimal DOM) and asserts against `module.exports` exposed by a guard at the end of the IIFE — the guard is a no-op in Tampermonkey.

**Run the script:** paste `script` into a new Tampermonkey userscript. The first click on the blue "СЛЕЗА // ПРОВЕРИТЬ" button opens a modal asking for `GROQ_KEY` and `SLEZA_KEY` — these are stored via `GM_setValue`, not in the file. Edit later via the `⚙ Ключи` button in the modal header.

**Common commands:**
- `node --check script` — syntax-check the userscript without a browser.
- `npm install` — first time only.
- `npm test` — run the whole suite (excludes the integration smoke).
- `npx vitest run tests/<name>.test.js` — run one file.
- `npx vitest run -t "<test name fragment>"` — run one test by name.
- `npm run test:watch` — watch mode while editing logic.
- `npm run test:ci` — what CI runs (junit reporter to `test-results.xml`).
- `RUN_SMOKE=1 GROQ_KEY=… npm test` — also runs `tests/integration/groq.smoke.test.js` against the real Groq API. Off by default.

CI lives at `.github/workflows/test.yml`, runs on every push, uploads `test-results.xml` as an artifact.

## Architecture

The script is a single IIFE that performs a compliance audit of Russian websites against multiple laws. Understanding it requires knowing the **data flow**, not the file layout (everything is in one file).

### External services it calls
- `sleza.media/api/parse` — official registry of foreign agents / extremists / undesirable orgs. Authoritative; rate-limited to 1 req/sec (`SLEZA_DELAY_MS = 1100`).
- `egrul.org/<id>.json` — FNS ЕГРЮЛ/ЕГРИП lookup by ИНН or ОГРН (149-ФЗ verification).
- `api.groq.com` (llama-3.3-70b-versatile) — AI analyst for the laws Sleza doesn't cover (152-ФЗ, ЕРИР, 149-ФЗ, оферта, наркотики). Plus a second, narrower call from `verify152FZWithAI` — the AI arbiter for 152-ФЗ.

All HTTP goes through `GM_xmlhttpRequest` (cross-origin bypass) — `fetch` won't work because of CSP/CORS on third-party sites. In tests this transport is replaced by a route table in `tests/mockGM.js`.

### Two scan modes
- **Single page** (`runSinglePageScan`): reads current DOM, sends to Sleza, extracts ИНН/ОГРН, calls ЕГРЮЛ, runs AI.
- **Full site** (`runFullSiteScan`): the interesting pipeline.

### Full-site pipeline (the core)
1. **URL discovery**: `trySitemap` (sitemap.xml + sitemap-index recursion) → fallback to `crawlSite` BFS with `MAX_DEPTH = 2`.
2. **Prioritization**: `scoreUrl` returns `-1` (skip), `3` (other), `5` (corporate), `7` (homepage), `10` (content). Strategy: take all HIGH, fill with ≤5 MED for AI context, fill remainder with LOW, cap at `MAX_PAGES`. **Current page is always first in the list.**
3. **Local prefilter**: `hasNameLikePatterns` — regex check for FIO/quoted titles/citation verbs. If false, the page is marked `skipped` and the Sleza API call is **not made and the 1.1s delay is skipped**. Major cost optimization — keep it.
4. **Sleza scan**: one request per surviving page; results parsed by `parseSlezaItem` and contextualized by `checkMarkingNearby` (looks ±200/+400 chars around each name occurrence for `MARK_RE` patterns; also checks star+footnote and document tail).
5. **ЕГРЮЛ verification**: `extractIdentifiers` greps text for ИНН (12/10 digits) and ОГРН/ОГРНИП (15/13 digits) — alternation order matters, longer first, otherwise ИП identifiers are truncated. Then `checkEgrul` → `parseEgrulData` (defensive — FNS returns several shapes: `СвЮЛ`, flat `НаимЮЛПолн`, `СвИП`, flat `ОГРНИП`).
6. **AI pass**: `runAIAnalysis` fetches up to 4 policy/offer/return/about sub-pages; if no policy was found it falls back to `discoverPolicyByCommonPaths` which probes 14 common URL paths in two waves. Prompt structure (D2, 2026-05-21): main page compact header → compliance pages **labeled with source URL** → EGRUL block → local checklists. `bodyText` is trimmed to 2000 chars in the prompt (full text already used by local checks). `hasConsentCheckbox` is included in the meta line. Groq call is wrapped in `tryGroq()` with **2 retry attempts and 3s backoff** (D1, 2026-05-22). SYSTEM prompt instructs the model to trust local checklists, not recompute them, and to fill `found_text`/`location`/`found_url` from actual page content. If `GROQ_KEY` is empty or `USE_AI=false`, returns a local-only report assembled by `buildLocalChecks`.

### Local checks, AI overrides, and the 152-ФЗ arbiter
Six deterministic checks are computed locally:
- `check152FZ` — 7 mandatory points of ст. 18.1 152-ФЗ. Three-tier detection per point: section-aware heading regex (`(?:^|\n)\s*(?:\d+\.…)`), pattern regex, keyword list.
- `check149FZ` — ИНН/ОГРН + name + address + email + phone (5 points).
- `checkERIR`, `checkOffer`, `checkCookieCompliance`, `checkDrugs` — domain-specific.
- `parseEgrulData.isActive` — shown directly in `renderEgrulBlock`.

In `renderAICheck`, if a card's `law_code` matches a local check, the local status replaces the AI's status.

For 152-ФЗ specifically there is also an **AI arbiter**: `verify152FZWithAI` is called from `runAIAnalysis` only when the local check found 1–5 of 7 points. It sends just the missing items plus the full policy text to Groq with a narrow JSON-only prompt and **only upgrades** items the AI confirms (`confirmedBy: 'ai'`); it never downgrades. On any error it returns the local result unchanged. UI distinguishes AI-confirmed (`.sz-152-icon.ai`) from locally-found (`.sz-152-icon.ok`).

When adding a new law, decide upfront: local-deterministic (preferred, no AI cost, no flakiness) or AI-evaluated (only if it requires fuzzy language understanding).

### Rendering
Plain string-template HTML injected into a fixed-position modal (`#sz-ov`). CSS lives in one `GM_addStyle` block. All class names are prefixed `sz-` to avoid clashing with the host site. Two interactions worth knowing:
- `findElementByText` + `highlightElement` — used by the 📍 buttons to scroll the host page to the offending text and flash an outline.
- `setModalDimmed` — temporarily fades the modal so the user can see the highlighted element on the host page.

### Tunables (top of file)
`MAX_PAGES`, `MAX_DEPTH`, `SLEZA_DELAY_MS`, `FETCH_TIMEOUT`, `USE_AI`. Changing `SLEZA_DELAY_MS` below 1000 will rate-limit you out.

### Cancellation
`scanCancelled` is a module-level flag; every async step checks it. `closeModal` sets it. Don't add long awaits without a check before/after.

## Test infrastructure

- `tests/loadScript.js` — reads `./script`, executes it inside a Node `vm` context with a sandbox containing the GM shims and a minimal DOM (`document.body.appendChild`, `DOMParser`), returns `module.exports`. Source is cached so dozens of tests don't re-read the file.
- `tests/mockGM.js` — factory for the `GM_xmlhttpRequest` mock. Pass `gmRoutes: [{ match: req=>bool, response | error: 'network'|'timeout' | respond: req=>res }]` to `loadScript({ gmValues, gmRoutes })`. All outbound calls land in `gm.calls` for assertions.
- AI-function tests (`runAIAnalysis`, `verify152FZWithAI`) provide both a Groq route and a catch-all `404` route, because `runAIAnalysis` calls `discoverPolicyByCommonPaths` which probes 14 URLs.
- The smoke test against the real Groq API lives in `tests/integration/` and is excluded from the default run by `vitest.config.js`.

When adding logic to a pure function, also add it to `module.exports` at the bottom of `script` — otherwise tests can't reach it.

## Known regex traps in this codebase

These have already burned us; check the same shapes when adding similar code:
- **Surrogate-pair emoji + `?`**: in non-`u`-flag JavaScript regex, `💧?` is `💧?` and *requires* the high surrogate. Wrap in `(?:💧)?` or add `u` flag.
- **Alternation order with different lengths**: `[0-9]{10}|[0-9]{12}` matches 10 digits first and silently truncates a 12-digit number. Put the longer alternative first.
- **Section-aware anchors**: `(?:^|\n)\s*\d+\.` is required to recognize numbered headings — without `(?:^|\n)` an inline `5.` triggers a false match.

## Git workflow for this repo

- Active branch: `main` (all fixes merged here directly).
- Push with `git push origin main`.
- After changes to `script`, update the bundled copy in sleza-web: `cp ~/sleza_tets_js/script ~/sleza-web/backend/sleza_script`
- Do not open PRs unless the user asks.
