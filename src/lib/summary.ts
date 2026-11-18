import { dayKey, formatDayShort, periodStart } from './dates';
import { formatRupees } from './format';
import type { Order } from './types';

export type ItemTotal = { key: string; name: string; qty: number; amount: number };
export type DayTotal = { key: string; date: Date; orderCount: number; total: number };

export type Summary = {
  orderCount: number;
  total: number;
  cash: number;
  cashCount: number;
  upi: number;
  upiCount: number;
  pending: number;
  pendingCount: number;
  itemCount: number;
  items: ItemTotal[];
  dineIn: number;
  parcel: number;
  untagged: number;
  /** Days that have at least one order, newest first. */
  days: DayTotal[];
};

/**
 * Aggregate orders into totals. Deleted orders are ignored.
 * `menuOrder` is the list of menu item ids in display order, used to sort the per-item rows.
 * Lines are grouped by menu item id, so a price or name change mid-month still counts as one item.
 */
export function summarize(orders: Order[], menuOrder: number[] = []): Summary {
  const s: Summary = {
    orderCount: 0, total: 0,
    cash: 0, cashCount: 0, upi: 0, upiCount: 0, pending: 0, pendingCount: 0,
    itemCount: 0, items: [], dineIn: 0, parcel: 0, untagged: 0, days: [],
  };
  const items = new Map<string, ItemTotal & { seenAt: number; menuId: number | null }>();
  const days = new Map<string, DayTotal>();

  for (const o of orders) {
    if (o.deleted) continue;
    s.orderCount += 1;
    s.total += o.total;
    if (o.status === 'cash') { s.cash += o.total; s.cashCount += 1; }
    else if (o.status === 'upi') { s.upi += o.total; s.upiCount += 1; }
    else { s.pending += o.total; s.pendingCount += 1; }

    if (o.order_type === 'dine_in') s.dineIn += 1;
    else if (o.order_type === 'parcel') s.parcel += 1;
    else s.untagged += 1;

    for (const line of o.items) {
      const key = line.menu_item_id != null ? `m${line.menu_item_id}` : `n${line.name}`;
      let it = items.get(key);
      if (!it) {
        it = { key, name: line.name, qty: 0, amount: 0, seenAt: o.created_at, menuId: line.menu_item_id };
        items.set(key, it);
      }
      // Show the most recent name if the item was renamed.
      if (o.created_at >= it.seenAt) { it.name = line.name; it.seenAt = o.created_at; }
      it.qty += line.qty;
      it.amount += line.qty * line.price;
      s.itemCount += line.qty;
    }

    const dk = dayKey(o.created_at);
    let day = days.get(dk);
    if (!day) {
      day = { key: dk, date: periodStart('day', new Date(o.created_at)), orderCount: 0, total: 0 };
      days.set(dk, day);
    }
    day.orderCount += 1;
    day.total += o.total;
  }

  const rank = (menuId: number | null) => {
    const i = menuId == null ? -1 : menuOrder.indexOf(menuId);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  s.items = [...items.values()]
    .sort((a, b) => rank(a.menuId) - rank(b.menuId) || a.name.localeCompare(b.name))
    .map(({ key, name, qty, amount }) => ({ key, name, qty, amount }));
  s.days = [...days.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  return s;
}

/** Plain-text version for sharing on WhatsApp/SMS. */
export function summaryText(
  s: Summary,
  opts: { restaurantName: string; periodLabel: string; showOrderType: boolean; showDays: boolean },
): string {
  const out = [
    `*${opts.restaurantName}*`,
    opts.periodLabel,
    '',
    `Orders: ${s.orderCount}`,
    `Total sales: ${formatRupees(s.total)}`,
    `Cash: ${formatRupees(s.cash)}`,
    `UPI: ${formatRupees(s.upi)}`,
    `Pending: ${formatRupees(s.pending)} (${s.pendingCount})`,
  ];
  if (s.items.length) {
    out.push('', 'Items sold:');
    for (const it of s.items) out.push(`${it.name} × ${it.qty} = ${formatRupees(it.amount)}`);
  }
  if (opts.showOrderType) {
    out.push('', `Dine-in: ${s.dineIn} · Parcel: ${s.parcel}`);
  }
  if (opts.showDays && s.days.length) {
    out.push('', 'Day by day:');
    for (const d of s.days) out.push(`${formatDayShort(d.date)}: ${d.orderCount} orders, ${formatRupees(d.total)}`);
  }
  return out.join('\n');
}
