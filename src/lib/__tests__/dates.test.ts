import { isLatestPeriod, periodLabel, periodRange, shiftPeriod } from '../dates';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);

describe('periodRange', () => {
  it('day covers local midnight to midnight', () => {
    const r = periodRange('day', d(2026, 11, 18, 21));
    expect(new Date(r.start)).toEqual(new Date(2026, 10, 18));
    expect(new Date(r.end)).toEqual(new Date(2026, 10, 19));
  });

  it('week starts on Monday', () => {
    for (const day of [16, 18, 22]) {
      const r = periodRange('week', d(2026, 11, day));
      expect(new Date(r.start)).toEqual(new Date(2026, 10, 16)); // Mon 16 Nov 2026
      expect(new Date(r.end)).toEqual(new Date(2026, 10, 23));
    }
  });

  it('week spanning a month boundary', () => {
    const r = periodRange('week', d(2026, 12, 2)); // Wed
    expect(new Date(r.start)).toEqual(new Date(2026, 10, 30));
    expect(new Date(r.end)).toEqual(new Date(2026, 11, 7));
  });

  it('month covers the whole calendar month', () => {
    const r = periodRange('month', d(2026, 2, 14));
    expect(new Date(r.start)).toEqual(new Date(2026, 1, 1));
    expect(new Date(r.end)).toEqual(new Date(2026, 2, 1));
  });
});

describe('shiftPeriod', () => {
  it('moves months without day overflow (31 Jan -> Feb)', () => {
    expect(shiftPeriod('month', d(2026, 1, 31), 1)).toEqual(new Date(2026, 1, 1));
  });
  it('crosses year boundaries', () => {
    expect(shiftPeriod('month', d(2026, 12, 5), 1)).toEqual(new Date(2027, 0, 1));
    expect(shiftPeriod('day', d(2027, 1, 1), -1)).toEqual(new Date(2026, 11, 31));
    expect(shiftPeriod('week', d(2026, 11, 18), -1)).toEqual(new Date(2026, 10, 9));
  });
});

describe('isLatestPeriod / periodLabel', () => {
  const now = d(2026, 11, 18, 20);
  it('detects current period', () => {
    expect(isLatestPeriod('day', d(2026, 11, 18, 1), now)).toBe(true);
    expect(isLatestPeriod('day', d(2026, 11, 17), now)).toBe(false);
    expect(isLatestPeriod('month', d(2026, 11, 1), now)).toBe(true);
  });
  it('labels', () => {
    expect(periodLabel('day', now, now)).toBe('Today · Wed, 18 Nov');
    expect(periodLabel('day', d(2026, 11, 17), now)).toBe('Yesterday · Tue, 17 Nov');
    expect(periodLabel('day', d(2025, 11, 17), now)).toBe('Mon, 17 Nov 2025');
    expect(periodLabel('week', now, now)).toBe('This week · 16 – 22 Nov');
    expect(periodLabel('week', d(2026, 12, 2), now)).toBe('This week · 30 Nov – 6 Dec');
    expect(periodLabel('week', d(2026, 11, 4), now)).toBe('2 – 8 Nov');
    expect(periodLabel('month', now, now)).toBe('November 2026');
  });
});
