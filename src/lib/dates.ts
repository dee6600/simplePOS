export type Period = 'day' | 'week' | 'month';
/** [start, end) in ms since epoch, local time. */
export type Range = { start: number; end: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** First moment of the day / week (Monday) / month containing `anchor`. */
export function periodStart(period: Period, anchor: Date): Date {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();
  switch (period) {
    case 'day':
      return new Date(y, m, d);
    case 'week':
      return new Date(y, m, d - ((anchor.getDay() + 6) % 7));
    case 'month':
      return new Date(y, m, 1);
  }
}

/** Start of the period `delta` steps away from the one containing `anchor`. */
export function shiftPeriod(period: Period, anchor: Date, delta: number): Date {
  const s = periodStart(period, anchor);
  const y = s.getFullYear();
  const m = s.getMonth();
  const d = s.getDate();
  switch (period) {
    case 'day':
      return new Date(y, m, d + delta);
    case 'week':
      return new Date(y, m, d + 7 * delta);
    case 'month':
      return new Date(y, m + delta, 1);
  }
}

export function periodRange(period: Period, anchor: Date): Range {
  return {
    start: periodStart(period, anchor).getTime(),
    end: shiftPeriod(period, anchor, 1).getTime(),
  };
}

/** True when the period containing `anchor` also contains `now` (or is later), so "next" makes no sense. */
export function isLatestPeriod(period: Period, anchor: Date, now: Date = new Date()): boolean {
  return periodRange(period, anchor).end > now.getTime();
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Local YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "Wed, 18 Nov" */
export function formatDayShort(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function periodLabel(period: Period, anchor: Date, now: Date = new Date()): string {
  const yearSuffix = (d: Date) => (d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '');
  switch (period) {
    case 'day': {
      const d = periodStart('day', anchor);
      const yesterday = shiftPeriod('day', now, -1);
      const base = formatDayShort(d) + yearSuffix(d);
      if (sameDay(d, now)) return `Today · ${base}`;
      if (sameDay(d, yesterday)) return `Yesterday · ${base}`;
      return base;
    }
    case 'week': {
      const s = periodStart('week', anchor);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      const left = s.getMonth() === e.getMonth() ? `${s.getDate()}` : `${s.getDate()} ${MONTHS[s.getMonth()]}`;
      const base = `${left} – ${e.getDate()} ${MONTHS[e.getMonth()]}${yearSuffix(e)}`;
      return isLatestPeriod('week', anchor, now) ? `This week · ${base}` : base;
    }
    case 'month': {
      const s = periodStart('month', anchor);
      return `${MONTHS_FULL[s.getMonth()]} ${s.getFullYear()}`;
    }
  }
}
