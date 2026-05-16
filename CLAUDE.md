# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Single-file Tampermonkey userscript. The entire product is `./script` (~1480 lines, JS in a UserScript header + IIFE). No `package.json`, no build, no tests, no lint. The file has no extension on purpose — that's what Tampermonkey imports.

To "run" the script: paste contents into a new Tampermonkey userscript in the browser, open any site, click the blue "СЛЕЗА // ПРОВЕРИТЬ" button bottom-right. Two real API keys (`GROQ_KEY`, `SLEZA_KEY`) must be filled at the top of the file — the committed placeholders won't work.

Syntax check without a browser: `node --check script` (treat the file as JS even without `.js`).

## Architecture

The script is a single IIFE that performs a compliance audit of Russian websites against multiple laws. Understanding it requires knowing the **data flow**, not the file layout (everything is in one file).

### External services it calls
- `sleza.media/api/parse` — official registry of foreign agents / extremists / undesirable orgs. Authoritative; rate-limited to 1 req/sec (`SLEZA_DELAY_MS = 1100`).
- `egrul.org/<id>.json` — FNS ЕГРЮЛ/ЕГРИП lookup by ИНН or ОГРН (149-ФЗ verification).
- `api.groq.com` (llama-3.3-70b-versatile) — AI analyst for the laws Sleza doesn't cover (152-ФЗ, ЕРИР, 149-ФЗ, оферта, наркотики). System prompt at `script:577` constrains it to return strict JSON.

All HTTP goes through `GM_xmlhttpRequest` (cross-origin bypass) — `fetch` won't work because of CSP/CORS on third-party sites.

### Two scan modes
- **Single page** (`runSinglePageScan`, ~line 846): reads current DOM, sends to Sleza, extracts ИНН/ОГРН, calls ЕГРЮЛ, runs AI.
- **Full site** (`runFullSiteScan`, ~line 878): the interesting pipeline.

### Full-site pipeline (the core)
1. **URL discovery**: `trySitemap` (sitemap.xml + sitemap-index recursion) → fallback to `crawlSite` BFS with `MAX_DEPTH = 2`.
2. **Prioritization**: `scoreUrl` (~line 342) returns `-1` (skip), `3` (other), `5` (corporate), `7` (homepage), `10` (content). Strategy: take all HIGH, fill with ≤5 MED for AI context, fill remainder with LOW, cap at `MAX_PAGES = 100`. **Current page is always first in the list.**
3. **Local prefilter**: `hasNameLikePatterns` (~line 176) — regex check for FIO/quoted titles/citation verbs. If false, the page is marked `skipped` and the Sleza API call is **not made and the 1.1s delay is skipped**. This is a major cost optimization — keep it.
4. **Sleza scan**: one request per surviving page; results parsed by `parseSlezaItem` and contextualized by `checkMarkingNearby` (looks ±100/+250 chars around the name for `MARK_PATTERNS`).
5. **ЕГРЮЛ verification**: `extractIdentifiers` greps text for ИНН (10/12 digits) and ОГРН/ОГРНИП (13/15 digits) → `checkEgrul` → `parseEgrulData` (defensive — FNS returns several shapes: `СвЮЛ`, `НаимЮЛПолн`, `СвИП`, `ОГРНИП`).
6. **AI pass**: `runAIAnalysis` fetches up to 4 policy/offer/return/about sub-pages, packs them plus ЕГРЮЛ verdict plus the local 152-ФЗ checklist result into a single prompt, expects strict JSON back.

### Local checks override AI
Two deterministic checks are computed locally and **override** the AI's verdict in the rendered card:
- `check152FZ` (~line 205) — checks the privacy policy text against 7 mandatory points of ст. 18.1 152-ФЗ. Returns `ok` / `risk` / `violation` / `no_policy`. In `renderAICheck` (~line 1349), if the card's `law_code` includes "152-ФЗ", the local status replaces the AI's status.
- `parseEgrulData` — its `isActive` flag is shown directly (`renderEgrulBlock`, ~line 1440) and the system prompt instructs the AI not to re-derive 149-ФЗ.

When adding a new law, decide upfront: local-deterministic (preferred, no AI cost, no flakiness) or AI-evaluated (only if it requires fuzzy language understanding).

### Rendering
Plain string-template HTML injected into a fixed-position modal (`#sz-ov`). CSS lives in one `GM_addStyle` block (~line 601). All class names are prefixed `sz-` to avoid clashing with the host site. Two interactions worth knowing:
- `findElementByText` + `highlightElement` — used by the 📍 buttons to scroll the host page to the offending text and flash an outline.
- `setModalDimmed` — temporarily fades the modal so the user can see the highlighted element on the host page.

### Tunables (top of file)
`MAX_PAGES`, `MAX_DEPTH`, `BATCH_SIZE` (unused right now — Sleza is called per-page, not batched), `SLEZA_DELAY_MS`, `FETCH_TIMEOUT`. Changing `SLEZA_DELAY_MS` below 1000 will rate-limit you out.

### Cancellation
`scanCancelled` is a module-level flag; every async step checks it. `closeModal` sets it. Don't add long awaits without a check before/after.

## Git workflow for this repo

- Develop on `claude/improve-compliance-checker-HjMh0`. `main` is the published baseline.
- Push with `git push -u origin claude/improve-compliance-checker-HjMh0`. Do not push to `main` without explicit user request.
- GitHub access is via the `mcp__github__*` MCP tools, scoped to `xpommo/sleza_tets_js`. `gh` CLI is not available.
- Do not open PRs unless the user asks.
