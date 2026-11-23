/** How an order was paid. 'pending' only appears on orders saved by app versions before 1.3. */
export type Status = 'pending' | 'cash' | 'upi';
/** The choices the app offers when saving an order (v1.3 removed Pending). */
export type PaidStatus = 'cash' | 'upi';
export type OrderType = 'dine_in' | 'parcel' | null;

export type MenuItem = {
  id: number;
  uid: string;
  name: string;
  price: number; // whole rupees
  color: string;
  sort_order: number;
  active: number; // 1 = shown on the order screen
};

/** One line of an order. name/price are copied at save time so menu edits don't rewrite history. */
export type OrderLine = {
  menu_item_id: number | null;
  name: string;
  price: number;
  qty: number;
};

export type Order = {
  id: number;
  uid: string;
  order_no: number;
  created_at: number; // ms since epoch
  updated_at: number;
  status: Status;
  order_type: OrderType;
  total: number;
  deleted: number;
  created_by: string;
  /** Who last changed (or deleted) it. Same as created_by until someone edits it; '' if unknown. */
  updated_by: string;
  items: OrderLine[];
};

/** Where money is: the cash box or the bank account (UPI payments land in the bank). */
export type Method = 'cash' | 'bank';
/** expense = money spent on the business; in / out = lump sum added to / taken out of the balance. */
export type MoneyKind = 'expense' | 'in' | 'out';

export type MoneyEntry = {
  id: number;
  uid: string;
  kind: MoneyKind;
  created_at: number;
  updated_at: number;
  category: string | null; // expenses only
  amount: number; // whole rupees, always positive
  method: Method;
  note: string;
  created_by: string;
  /** Who last changed (or deleted) it. Same as created_by until someone edits it. */
  updated_by: string;
  deleted: number;
};

export type Settings = {
  showOrderType: boolean;
  restaurantName: string;
};

/**
 * cooked = weighed after cooking (biryani); home = bought in bulk and kept at home, sent to the shop as needed;
 * daily = bought fresh each day (chicken, vegetables).
 */
export type StockGroup = 'cooked' | 'home' | 'daily';
/**
 * in = cooked (cooked items) or bought (others); out = sent from home to the shop;
 * left = left over at closing (cooked); staff = one staff/worker portion (cooked).
 */
export type StockKind = 'in' | 'out' | 'left' | 'staff';

export type StockItem = {
  id: number;
  uid: string;
  name: string;
  /** kg, g, L, packet, bunch, pcs. Quantities are stored in this unit (staff portions in kg, shown in grams). */
  unit: string;
  grp: StockGroup;
  sort_order: number;
  active: number;
  /** At-home items: warn when the stock falls to this level. */
  low_level: number | null;
  /** Expense category used when a purchase also records what was paid. */
  expense_category: string | null;
};

export type StockEntry = {
  id: number;
  uid: string;
  item_uid: string;
  kind: StockKind;
  qty: number;
  /** The expense saved with this purchase, if any. */
  money_uid: string | null;
  note: string;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
  deleted: number;
  /** From the linked expense (when it still exists). */
  paid_amount: number | null;
  paid_method: Method | null;
};
