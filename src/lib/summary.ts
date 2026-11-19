import type { Balance } from './balance';
import { dayKey, formatDayShort, periodStart } from './dates';
import { formatRupees } from './format';
import type { MoneyEntry, Order } from './types';

export type ItemTotal = { key: string; name: string; qty: number; amount: number };
export type DayTotal = { key: string; date: Date; orderCount: number; total: number; expenses: number };
export type CategoryTotal = { category: string; amount: number; count: number };

export type Summary = {
  orderCount: number;
  total: number;
  cash: number;
  cashCount: number;
  upi: number;
  upiCount: number;
  itemCount: number;
  items: ItemTotal[];
  dineIn: number;
  parcel: number;
  untagged: number;
  /** Money spent on the business in this period. */
  expenses: number;
  expenseCount: number;
  expensesByCategory: CategoryTotal[];
  /** Sales + money added − expenses. Money taken out is not counted (it is a withdrawal, not a cost). */
  profit: number;
  /** Lump sums added to / taken out of the balance. Money added counts as profit. */
  moneyIn: number;
  moneyOut: number;
  /** Days that have at least one order or expense, newest first. */
  days: DayTotal[];
};

/**
 * Aggregate orders (and money entries) into totals. Deleted rows are ignored.
 * `menuOrder` is the list of menu item ids in display order, used to sort the per-item rows.
 * Lines are grouped by menu item id, so a price or name change mid-month still counts as one item.
 */
export function summarize(orders: Order[], menuOrder: number[] = [], entries: MoneyEntry[] = []): Summary {
  const s: Summary = {
    orderCount: 0, total: 0,
    cash: 0, cashCount: 0, upi: 0, upiCount: 0,
    itemCount: 0, items: [], dineIn: 0, parcel: 0, untagged: 0,
    expenses: 0, expenseCount: 0, expensesByCategory: [], profit: 0, moneyIn: 0, moneyOut: 0,
    days: [],
  };
  const items = new Map<string, ItemTotal & { seenAt: number; menuId: number | null }>();
  const days = new Map<string, DayTotal>();
  const dayFor = (ts: number) => {
    const dk = dayKey(ts);
    let day = days.get(dk);
    if (!day) {
      day = { key: dk, date: periodStart('day', new Date(ts)), orderCount: 0, total: 0, expenses: 0 };
      days.set(dk, day);
    }
    return day;
  };

  for (const o of orders) {
    if (o.deleted) continue;
    s.orderCount += 1;
    s.total += o.total;
    if (o.status === 'cash') { s.cash += o.total; s.cashCount += 1; }
    else if (o.status === 'upi') { s.upi += o.total; s.upiCount += 1; }
    // An old unpaid order (before v1.3) counts in total sales only.

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

    const day = dayFor(o.created_at);
    day.orderCount += 1;
    day.total += o.total;
  }

  const categories = new Map<string, CategoryTotal>();
  for (const e of entries) {
    if (e.deleted) continue;
    if (e.kind === 'in') s.moneyIn += e.amount;
    else if (e.kind === 'out') s.moneyOut += e.amount;
    else {
      s.expenses += e.amount;
      s.expenseCount += 1;
      const name = e.category || 'Other';
      const c = categories.get(name) ?? { category: name, amount: 0, count: 0 };
      c.amount += e.amount;
      c.count += 1;
      categories.set(name, c);
      dayFor(e.created_at).expenses += e.amount;
    }
  }
  s.expensesByCategory = [...categories.values()].sort((a, b) => b.amount - a.amount);
  s.profit = s.total + s.moneyIn - s.expenses;

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
  opts: { restaurantName: string; periodLabel: string; showOrderType: boolean; showDays: boolean; balance?: Balance },
): string {
  const out = [
    `*${opts.restaurantName}*`,
    opts.periodLabel,
    '',
    `Orders: ${s.orderCount}`,
    `Total sales: ${formatRupees(s.total)}`,
    `Cash: ${formatRupees(s.cash)}`,
    `UPI: ${formatRupees(s.upi)}`,
  ];
  if (s.items.length) {
    out.push('', 'Items sold:');
    for (const it of s.items) out.push(`${it.name} × ${it.qty} = ${formatRupees(it.amount)}`);
  }
  if (opts.showOrderType) {
    out.push('', `Dine-in: ${s.dineIn} · Parcel: ${s.parcel}`);
  }
  if (s.expenseCount) {
    out.push('', `Expenses: ${formatRupees(s.expenses)}`);
    for (const c of s.expensesByCategory) out.push(`${c.category}: ${formatRupees(c.amount)}`);
  }
  if (s.moneyIn || s.moneyOut) {
    out.push('', `Money added: ${formatRupees(s.moneyIn)} · Taken out: ${formatRupees(s.moneyOut)}`);
  }
  out.push('', `*Profit (sales + money added − expenses): ${formatRupees(s.profit)}*`);
  if (opts.balance) {
    const b = opts.balance;
    out.push('', `Balance now: Cash ${formatRupees(b.cash)} · Bank ${formatRupees(b.bank)} · Total ${formatRupees(b.total)}`);
  }
  if (opts.showDays && s.days.length) {
    out.push('', 'Day by day:');
    for (const d of s.days) {
      const exp = d.expenses ? `, expenses ${formatRupees(d.expenses)}` : '';
      out.push(`${formatDayShort(d.date)}: ${d.orderCount} orders, ${formatRupees(d.total)}${exp}`);
    }
  }
  return out.join('\n');
}
