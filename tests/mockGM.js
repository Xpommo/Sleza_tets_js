/**
 * Моки GM_* функций и минимальный DOM для запуска IIFE-скрипта в Node.
 *
 * GM_xmlhttpRequest управляется таблицей "routes":
 *   [{ match: (req) => boolean, response: { status, responseText, ... } }]
 *   [{ match: (req) => boolean, error: 'network'|'timeout' }]
 *   [{ match: (req) => boolean, respond: (req) => ({ status, responseText }) }]
 *
 * Все исходящие запросы записываются в `gm.calls`.
 */
export function createMockGM({ values = {}, routes = [] } = {}) {
  const store = { ...values };
  const calls = [];
  const styles = [];

  function GM_getValue(key, def) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : def;
  }
  function GM_setValue(key, val) {
    store[key] = val;
  }
  function GM_addStyle(css) {
    styles.push(css);
  }

  function GM_xmlhttpRequest(req) {
    calls.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      data: req.data,
    });
    const route = routes.find(r => r.match(req));
    // Имитируем асинхронность настоящего GM_xmlhttpRequest.
    queueMicrotask(() => {
      if (!route) {
        req.onerror && req.onerror({ error: 'no_route', url: req.url });
        return;
      }
      if (route.error === 'timeout') {
        req.ontimeout && req.ontimeout({ error: 'timeout' });
        return;
      }
      if (route.error === 'network') {
        req.onerror && req.onerror({ error: 'network' });
        return;
      }
      const resp = route.respond ? route.respond(req) : route.response;
      req.onload && req.onload({
        status: resp.status ?? 200,
        responseText: resp.responseText ?? '',
        finalUrl: req.url,
      });
    });
    return { abort: () => {} };
  }

  // ── Минимальный DOM ──────────────────────────────────────────
  // Скрипту при загрузке нужны document.createElement('button'),
  // document.body.appendChild(), GM_addStyle, и DOMParser в parseSlezaItem
  // (не вызывается в тестах). Render-функции в тестах тоже не вызываем.
  function makeEl(tag) {
    const children = [];
    const el = {
      tagName: String(tag || '').toUpperCase(),
      style: {},
      attributes: {},
      children,
      childNodes: children,
      innerHTML: '',
      textContent: '',
      classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
      appendChild(c) { children.push(c); return c; },
      removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
      remove() {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      scrollIntoView() {},
      focus() {}, click() {}, blur() {},
      cloneNode() { return makeEl(tag); },
    };
    Object.defineProperty(el, 'onclick', { writable: true, value: null });
    return el;
  }
  const body = makeEl('body');
  const head = makeEl('head');
  const documentEl = makeEl('html');
  const document = {
    body, head, documentElement: documentEl,
    createElement: makeEl,
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    title: '',
    readyState: 'complete',
    cookie: '',
    location: { href: 'https://test.local/', origin: 'https://test.local', hostname: 'test.local', pathname: '/' },
  };

  const location = document.location;
  const window = { location, document };

  // Минимальный DOMParser для parseSlezaItem (он же используется в crawler — но тестовый
  // суррогат должен лишь не падать при require/parseFromString с любым входом).
  class DOMParser {
    parseFromString(html, _type) {
      // Очень упрощённый парсер: возвращаем псевдо-документ с textContent и links.
      return {
        body: { textContent: String(html || '').replace(/<[^>]+>/g, ' ') },
        querySelectorAll: () => [],
        querySelector: () => null,
        documentElement: { outerHTML: String(html || '') },
      };
    }
  }

  return {
    GM_getValue, GM_setValue, GM_addStyle, GM_xmlhttpRequest,
    document, window, location, DOMParser,
    calls, store, styles,
    setRoutes(next) { routes = next; },
    pushRoute(r) { routes.push(r); },
  };
}
