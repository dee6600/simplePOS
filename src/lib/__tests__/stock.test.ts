import { formatGrams, formatQty, kitchenLines, parseQty, platesFor, platesText, soldQty, totalsByItem } from '../stock';
import type { StockItem, StockKind } from '../types';

const e = (item_uid: string, kind: StockKind, qty: number, deleted = 0) => ({ item_uid, kind, qty, deleted });
const item = (uid: string, name: string, grp: StockItem['grp'], unit = 'kg'): StockItem => ({
  id: 1, uid, name, unit, grp, sort_order: 0, active: 1, low_level: null, expense_category: null,
});

describe('stock maths', () => {
  it('adds up cooked, left and staff portions, and works out what was sold', () => {
    const t = totalsByItem([
      e('hyd', 'in', 8), e('hyd', 'in', 4.5), // two batches
      e('hyd', 'left', 1.5),
      e('hyd', 'staff', 0.25), e('hyd', 'staff', 0.2), e('hyd', 'staff', 0.3),
      e('hyd', 'in', 99, 1), // deleted
    ]).get('hyd')!;
    expect([t.in, t.left, t.staff, t.staffCount]).toEqual([12.5, 1.5, 0.75, 3]);
    expect(soldQty(t)).toBe(10.25);
    expect(formatGrams(t.staff)).toBe('750 g');
    expect(formatGrams(1.25)).toBe('1.25 kg');
  });

  it('ignores kinds it does not know (from a newer app version)', () => {
    const t = totalsByItem([e('rice', 'in', 25), e('rice', 'out', 5), e('rice', 'wasted' as StockKind, 3)]).get('rice')!;
    expect([t.in, t.out, t.count]).toEqual([25, 5, 2]);
  });

  it('parses typed quantities and avoids floating-point noise', () => {
    expect(parseQty('2.5')).toBe(2.5);
    expect(parseQty('2,5')).toBe(2.5);
    expect(parseQty('0')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(formatQty(0.1 + 0.2, 'kg')).toBe('0.3 kg');
    expect(formatQty(250, 'g')).toBe('250 g');
    expect(formatQty(2, 'packet')).toBe('2 packet');
  });

  it('matches plates sold to the biryani by its first word', () => {
    const sold = [
      { name: 'Hyderabadi Chicken Biryani Half', qty: 28 },
      { name: 'Hyderabadi Chicken Biryani Full', qty: 14 },
      { name: 'Tandoor Chicken Biryani Half', qty: 5 },
      { name: 'Chicken 65', qty: 9 },
    ];
    const p = platesFor('Hyderabadi Chicken Biryani', sold);
    expect(p).toEqual({ half: 28, full: 14, other: 0 });
    expect(platesText(p)).toBe('28 half + 14 full');
    expect(platesText(platesFor('Tandoor Chicken Biryani', sold))).toBe('5 half');
    expect(platesText(platesFor('Khushka', sold))).toBeNull();
  });

  it('writes one line per item that has entries', () => {
    const items = [item('hyd', 'Hyderabadi', 'cooked'), item('rice', 'Rice', 'home'), item('chk', 'Chicken', 'daily'), item('oil', 'Oil', 'home', 'L')];
    const lines = kitchenLines(items, totalsByItem([
      e('hyd', 'in', 12), e('hyd', 'left', 1), e('hyd', 'staff', 0.5),
      e('rice', 'in', 50), e('rice', 'out', 45),
      e('chk', 'in', 18),
    ]));
    expect(lines.map((l) => `${l.item.name}: ${l.text}`)).toEqual([
      'Hyderabadi: cooked 12 kg · left 1 kg · staff 500 g · sold ≈ 10.5 kg',
      'Rice: bought 50 kg · sent 45 kg',
      'Chicken: bought 18 kg',
    ]);
  });
});
