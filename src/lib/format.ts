import type { OrderLine } from './types';

/** ₹ with Indian digit grouping: 123456 -> ₹1,23,456 */
export function formatRupees(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.round(Math.abs(n)).toString();
  let head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${head ? `${head},${tail}` : tail}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export function linesTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export function linesCount(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/** "2× Chicken Biryani Full, 1× Water Bottle" */
export function describeLines(lines: OrderLine[]): string {
  return lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
}
