import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './loadScript.js';

let checkOffer;
beforeAll(() => { checkOffer = loadScript().exports.checkOffer; });

const PAD = ' ' + 'x'.repeat(120);

describe('checkOffer', () => {
  it('returns unknown for short input', () => {
    expect(checkOffer('hi', []).status).toBe('unknown');
  });

  it('returns ok for a non-commercial informational site', () => {
    const text = PAD + ' Наш блог о путешествиях. Просто истории, без продаж.';
    const r = checkOffer(text, []);
    expect(r.isCommercial).toBe(false);
    expect(r.kind).toBeNull();
    expect(r.status).toBe('ok');
  });

  it('detects e-commerce site by multiple markers', () => {
    const text = `${PAD} Купить кроссовки. Добавить в корзину. Доставка по всей России.
      Цена: 4990 руб. Самовывоз доступен.`;
    const r = checkOffer(text, []);
    expect(r.isCommercial).toBe(true);
    expect(r.kind).toBe('ecommerce');
  });

  it('detects SaaS site', () => {
    const text = `${PAD} Лицензионный договор. Тарифные планы. Подписка ежемесячная.
      Личный кабинет. Программное обеспечение для бухгалтерии.`;
    const r = checkOffer(text, []);
    expect(r.isCommercial).toBe(true);
    expect(r.kind).toBe('saas');
  });

  it('detects B2B services site', () => {
    const text = `${PAD} Исполнитель оказывает рекламные услуги Заказчику.
      Договор подряда. Акт сдачи-приёмки. Техническое задание.`;
    const r = checkOffer(text, []);
    expect(r.isCommercial).toBe(true);
    expect(r.kind).toBe('services');
  });

  it('flags ok for e-commerce with all 4 elements', () => {
    const text = `${PAD}
      Интернет-магазин. Купить. Цена 1000 руб. Доставка курьером.
      Публичная оферта на странице. Возврат товара возможен в течение 14 дней.
      ООО "Тест", ИНН 7707083893, Email: shop@example.ru, тел: +7 495 111 22 33.
    `;
    const r = checkOffer(text, [{ href: 'https://example.com/offer' }]);
    expect(r.isCommercial).toBe(true);
    expect(r.found).toBe(4);
    expect(r.status).toBe('ok');
  });

  it('counts a present offer link as bonus for "offer_exists"', () => {
    const text = `${PAD} Интернет-магазин. Купить. Цена 100 руб. Доставка курьером.`;
    const r = checkOffer(text, [{ href: 'https://example.com/oferta' }]);
    const item = r.items.find(i => i.id === 'offer_exists');
    expect(item.present).toBe(true);
  });

  it('flags violation when commercial but <3 of 4 found', () => {
    const text = `${PAD} Интернет-магазин. Купить. Цена 100 руб. Доставка курьером.
      Самовывоз есть. Никаких реквизитов, оферты или контактов.`;
    const r = checkOffer(text, []);
    expect(r.isCommercial).toBe(true);
    expect(r.found).toBeLessThan(3);
    expect(r.status).toBe('violation');
  });
});
