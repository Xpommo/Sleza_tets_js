import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createMockGM } from './mockGM.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', 'script');

// Кэшируем исходник, чтобы 50+ тестов не читали файл с диска по разу каждый.
let _source = null;
function readSource() {
  if (_source == null) _source = fs.readFileSync(SCRIPT_PATH, 'utf8');
  return _source;
}

/**
 * Загружает script в свежий Node-vm контекст с подменёнными глобалами.
 * Возвращает module.exports скрипта (см. guard в конце IIFE).
 *
 * @param {object} opts
 * @param {object} [opts.gmValues] — начальные значения для GM_getValue (по умолчанию пустые).
 * @param {Array}  [opts.gmRoutes] — таблица моков для GM_xmlhttpRequest (см. mockGM.js).
 * @returns {{ exports: object, gm: object, ctx: object }}
 */
export function loadScript({ gmValues = {}, gmRoutes = [] } = {}) {
  const gm = createMockGM({ values: gmValues, routes: gmRoutes });

  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Error, RegExp, JSON, Math, Date,
    URL, URLSearchParams,
    GM_xmlhttpRequest: gm.GM_xmlhttpRequest,
    GM_addStyle: gm.GM_addStyle,
    GM_getValue: gm.GM_getValue,
    GM_setValue: gm.GM_setValue,
    // Минимальные DOM-шимы — IIFE при инициализации обращается к document.body.appendChild
    // для кнопки и DOMParser для parseSlezaItem. Стилевой стек не трогаем.
    document: gm.document,
    location: gm.location,
    window: gm.window,
    DOMParser: gm.DOMParser,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(readSource(), ctx, { filename: SCRIPT_PATH });

  return { exports: moduleObj.exports, gm, ctx };
}
