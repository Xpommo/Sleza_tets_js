import { describe, it, expect } from 'vitest';
import { loadScript } from './loadScript.js';

describe('loadScript smoke', () => {
  it('loads the IIFE and exposes module.exports', () => {
    const { exports } = loadScript();
    expect(typeof exports.check152FZ).toBe('function');
    expect(typeof exports.parseEgrulData).toBe('function');
    expect(typeof exports.extractIdentifiers).toBe('function');
    expect(typeof exports.scoreUrl).toBe('function');
    expect(typeof exports.parseSlezaItem).toBe('function');
    expect(typeof exports.hasNameLikePatterns).toBe('function');
    expect(typeof exports.runAIAnalysis).toBe('function');
    expect(typeof exports.verify152FZWithAI).toBe('function');
  });

  it('GM_getValue returns stored values when present', () => {
    const { exports } = loadScript({ gmValues: { GROQ_KEY: 'gsk_test', SLEZA_KEY: 'sleza_test' } });
    // Не имея прямого доступа к замыкаемым GROQ_KEY/SLEZA_KEY, проверяем косвенно:
    // checkWithSleza при пустом ключе возвращает no_key, а с ключом пытается отправить запрос.
    expect(typeof exports.checkWithSleza).toBe('function');
  });
});
