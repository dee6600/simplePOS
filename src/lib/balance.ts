export type BalanceSums = {
  cashSales: number;
  upiSales: number;
  cashIn: number;
  cashOut: number;
  cashExpenses: number;
  bankIn: number;
  bankOut: number;
  bankExpenses: number;
};

export type Balance = {
  /** Money that should be in the cash box. */
  cash: number;
  /** Money in the bank account (UPI payments land here). */
  bank: number;
  total: number;
};

/**
 * Cash = paid-Cash orders + cash added − cash taken out − cash expenses.
 * Bank = paid-UPI orders + bank added − bank taken out − bank expenses.
 */
export function computeBalance(s: BalanceSums): Balance {
  const cash = s.cashSales + s.cashIn - s.cashOut - s.cashExpenses;
  const bank = s.upiSales + s.bankIn - s.bankOut - s.bankExpenses;
  return { cash, bank, total: cash + bank };
}

/** Preset expense categories (the note field covers anything else). */
export const EXPENSE_CATEGORIES = [
  'Rice',
  'Chicken',
  'Mutton',
  'Oil',
  'Vegetables & Masala',
  'Packing',
  'Gas',
  'Water',
  'Salary',
  'Rent',
  'Electricity',
  'Other',
] as const;
