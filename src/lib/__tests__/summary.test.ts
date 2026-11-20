import { formatRupees, formatTime } from '../format';
import { summarize, summaryText } from '../summary';
import type { MoneyEntry, Order, OrderLine } from '../types';

let nextId = 1;
function order(partial: Partial<Order> & { items: OrderLine[] }): Order {
  const total = partial.items.reduce((s, l) => s + l.price * l.qty, 0);
  return {
    id: nextId,
    uid: `u${nextId++}`,
    created_by: '',
    updated_by: '',
    order_no: 1,
    created_at: new Date(2026, 10, 18, 13).getTime(),
    updated_at: 0,
    status: 'cash',
    order_type: null,
    total,
    deleted: 0,
    ...partial,
  };
}

const chickenFull = (qty: number, price = 200): OrderLine => ({ menu_item_id: 2, name: 'Chicken Biryani Full', price, qty });
const water = (qty: number): OrderLine => ({ menu_item_id: 6, name: 'Water Bottle', price: 20, qty });

describe('summarize', () => {
  it('splits cash / upi, counts old unpaid orders in sales only, and ignores deleted orders', () => {
    const s = summarize([
      order({ status: 'cash', items: [chickenFull(2)] }), // 400
      order({ status: 'upi', items: [chickenFull(1), water(2)] }), // 240
      order({ status: 'pending', items: [water(1)] }), // 20, saved before v1.3
      order({ status: 'cash', deleted: 1, items: [chickenFull(10)] }),
    ]);
    expect(s.orderCount).toBe(3);
    expect(s.total).toBe(660);
    expect([s.cash, s.cashCount]).toEqual([400, 1]);
    expect([s.upi, s.upiCount]).toEqual([240, 1]);
    expect(s.itemCount).toBe(6);
  });

  it('groups items by menu id across price/name changes, in menu order', () => {
    const s = summarize(
      [
        order({ created_at: 1000, items: [water(1), chickenFull(1, 180)] }),
        order({ created_at: 2000, items: [{ ...chickenFull(2), name: 'Chicken Full' }] }),
        order({ items: [{ menu_item_id: null, name: 'Old item', price: 50, qty: 1 }] }),
      ],
      [2, 6],
    );
    expect(s.items).toEqual([
      { key: 'm2', name: 'Chicken Full', qty: 3, amount: 580 },
      { key: 'm6', name: 'Water Bottle', qty: 1, amount: 20 },
      { key: 'nOld item', name: 'Old item', qty: 1, amount: 50 },
    ]);
  });

  it('counts dine-in / parcel and builds per-day rows newest first', () => {
    const s = summarize([
      order({ order_type: 'dine_in', created_at: new Date(2026, 10, 16, 12).getTime(), items: [water(1)] }),
      order({ order_type: 'parcel', created_at: new Date(2026, 10, 18, 12).getTime(), items: [water(2)] }),
      order({ created_at: new Date(2026, 10, 18, 22).getTime(), items: [water(1)] }),
    ]);
    expect([s.dineIn, s.parcel, s.untagged]).toEqual([1, 1, 1]);
    expect(s.days.map((d) => [d.key, d.orderCount, d.total])).toEqual([
      ['2026-11-18', 2, 60],
      ['2026-11-16', 1, 20],
    ]);
  });

  it('counts money added as profit, but not money taken out', () => {
    const entry = (kind: MoneyEntry['kind'], amount: number): MoneyEntry => ({
      id: nextId, uid: `m${nextId++}`, kind, amount, method: 'cash', category: kind === 'expense' ? 'Oil' : null,
      note: '', created_at: new Date(2026, 10, 18, 9).getTime(), updated_at: 0, deleted: 0,
      created_by: 'Dad', updated_by: 'Dad',
    });
    const s = summarize(
      [order({ items: [chickenFull(2)] })], // 400 sales
      [],
      [entry('in', 1000), entry('out', 300), entry('expense', 250), { ...entry('in', 99), deleted: 1 }],
    );
    expect([s.total, s.moneyIn, s.moneyOut, s.expenses, s.profit]).toEqual([400, 1000, 300, 250, 400 + 1000 - 250]);
    const text = summaryText(s, { restaurantName: 'Shop', periodLabel: 'Today', showOrderType: false, showDays: false });
    expect(text).toContain('Profit (sales + money added − expenses): ₹1,150');
    expect(text).not.toMatch(/pending/i);
  });

  it('handles no orders', () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.items).toEqual([]);
    expect(s.days).toEqual([]);
  });
});

describe('format', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(120)).toBe('₹120');
    expect(formatRupees(4560)).toBe('₹4,560');
    expect(formatRupees(123456)).toBe('₹1,23,456');
    expect(formatRupees(12345678)).toBe('₹1,23,45,678');
  });
  it('formats 12-hour time', () => {
    expect(formatTime(new Date(2026, 0, 1, 0, 5).getTime())).toBe('12:05 am');
    expect(formatTime(new Date(2026, 0, 1, 12, 0).getTime())).toBe('12:00 pm');
    expect(formatTime(new Date(2026, 0, 1, 19, 30).getTime())).toBe('7:30 pm');
  });
});
