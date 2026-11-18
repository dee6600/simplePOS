export type Status = 'pending' | 'cash' | 'upi';
export type OrderType = 'dine_in' | 'parcel' | null;

export type MenuItem = {
  id: number;
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
  order_no: number;
  created_at: number; // ms since epoch
  updated_at: number;
  status: Status;
  order_type: OrderType;
  total: number;
  deleted: number;
  items: OrderLine[];
};

export type Settings = {
  showOrderType: boolean;
  restaurantName: string;
};
