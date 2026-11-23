import type { ItemTotal } from './summary';
import type { StockEntry, StockGroup, StockItem, StockKind } from './types';

export const STOCK_UNITS = ['kg', 'L', 'bunch', 'pcs', 'packet'] as const;

export const GROUP_LABEL: Record<StockGroup, string> = {
  cooked: 'Biryani (weighed)',
  home: 'Kept at home',
  daily: 'Bought daily',
};

/** What each kind of entry means for each group, as shown on buttons and in lists. */
export function kindLabel(grp: StockGroup, kind: StockKind): string {
  if (grp === 'cooked') return kind === 'in' ? 'Cooked' : kind === 'left' ? 'Left' : kind === 'staff' ? 'Staff' : 'Out';
  if (kind === 'out') return 'Sent to shop';
  return 'Bought';
}

/** Rounds away floating-point noise (0.1 + 0.2). */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** "12.5 kg", "4 bunch". */
export function formatQty(qty: number, unit: string): string {
  return `${roundQty(qty)} ${unit}`;
}

/** Staff portions are stored in kg and shown in grams: 0.25 → "250 g"; 1.5 → "1.5 kg". */
export function formatGrams(kg: number): string {
  const g = Math.round(kg * 1000);
  return g >= 1000 ? `${roundQty(kg)} kg` : `${g} g`;
}

/** Parses what was typed ("2.5", "2,5"); null when it isn't a positive number. */
export function parseQty(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? roundQty(n) : null;
}

export type ItemTotals = { in: number; out: number; left: number; staff: number; staffCount: number; count: number };

const empty = (): ItemTotals => ({ in: 0, out: 0, left: 0, staff: 0, staffCount: 0, count: 0 });

/** Totals per stock item uid for a list of entries (deleted ones ignored). */
export function totalsByItem(entries: Pick<StockEntry, 'item_uid' | 'kind' | 'qty' | 'deleted'>[]): Map<string, ItemTotals> {
  const out = new Map<string, ItemTotals>();
  for (const e of entries) {
    if (e.deleted) continue;
    const t = out.get(e.item_uid) ?? empty();
    if (e.kind === 'in') t.in += e.qty;
    else if (e.kind === 'out') t.out += e.qty;
    else if (e.kind === 'left') t.left += e.qty;
    else if (e.kind === 'staff') {
      t.staff += e.qty;
      t.staffCount += 1;
    } else continue; // a kind from a newer app version
    t.count += 1;
    out.set(e.item_uid, t);
  }
  for (const t of out.values()) {
    t.in = roundQty(t.in);
    t.out = roundQty(t.out);
    t.left = roundQty(t.left);
    t.staff = roundQty(t.staff);
  }
  return out;
}

export function totalsFor(map: Map<string, ItemTotals>, uid: string): ItemTotals {
  return map.get(uid) ?? empty();
}

/** Cooked items: what went to customers ≈ cooked − left over − staff portions. */
export function soldQty(t: ItemTotals): number {
  return roundQty(t.in - t.left - t.staff);
}

export type Plates = { half: number; full: number; other: number };

/**
 * Plates sold of a cooked item, matched to menu items by the item's first word:
 * "Hyderabadi Chicken Biryani" counts "Hyderabadi Chicken Biryani Half / Full" (any name containing "hyderabadi").
 */
export function platesFor(itemName: string, sold: Pick<ItemTotal, 'name' | 'qty'>[]): Plates {
  const key = itemName.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const p: Plates = { half: 0, full: 0, other: 0 };
  if (!key) return p;
  for (const it of sold) {
    const name = it.name.toLowerCase();
    if (!name.includes(key)) continue;
    if (/\bhalf\b/.test(name)) p.half += it.qty;
    else if (/\bfull\b/.test(name)) p.full += it.qty;
    else p.other += it.qty;
  }
  return p;
}

export function platesText(p: Plates): string | null {
  const parts = [p.half && `${p.half} half`, p.full && `${p.full} full`, p.other && `${p.other} plates`].filter(Boolean);
  return parts.length ? parts.join(' + ') : null;
}

/** One line per item for the period, e.g. "Rice: bought 50 kg · sent 45 kg". Items without entries are skipped. */
export function kitchenLines(items: StockItem[], totals: Map<string, ItemTotals>): { item: StockItem; text: string }[] {
  const out: { item: StockItem; text: string }[] = [];
  for (const item of items) {
    const t = totals.get(item.uid);
    if (!t || t.count === 0) continue;
    let text: string;
    if (item.grp === 'cooked') {
      const parts = [`cooked ${formatQty(t.in, item.unit)}`];
      if (t.left) parts.push(`left ${formatQty(t.left, item.unit)}`);
      if (t.staff) parts.push(`staff ${formatGrams(t.staff)}`);
      parts.push(`sold ≈ ${formatQty(soldQty(t), item.unit)}`);
      text = parts.join(' · ');
    } else if (item.grp === 'home') {
      const parts = [];
      if (t.in) parts.push(`bought ${formatQty(t.in, item.unit)}`);
      if (t.out) parts.push(`sent ${formatQty(t.out, item.unit)}`);
      text = parts.join(' · ');
    } else {
      text = `bought ${formatQty(t.in, item.unit)}`;
    }
    out.push({ item, text });
  }
  return out;
}
