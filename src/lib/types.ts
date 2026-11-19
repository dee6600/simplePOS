export type Status = 'pending' | 'cash' | 'upi';
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
