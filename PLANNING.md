# SimplePOS: Planning

This document covers what SimplePOS is, who it's for, and how it's built. For the delivery schedule, see [MILESTONES.md](MILESTONES.md).

## 1. Vision

A point-of-sale app that a small seller can install and start using in under five minutes. It needs no account, subscription or internet connection. It should feel as quick as a calculator at the counter and keep accurate records for the end of the day.

### Target users

- Market stall and pop-up vendors
- Small cafés, kiosks and food trucks
- Hobby sellers at fairs and events

### Goals

- Record a typical sale in **3 taps or fewer** after the products are set up.
- Work **fully offline** and keep data safe on the device.
- Give accurate **daily totals** and an easy **CSV export** for accounting.
- Run well on **phones and tablets**, on both iOS and Android.

### Non-goals for v1

- Multi-device sync or a cloud backend
- Inventory tracking across multiple locations
- Integrated card-payment terminals (card sales are recorded, not processed)
- Staff accounts and permissions
- Fiscal or tax-authority compliance for specific countries

## 2. Features and user stories

| #  | As a seller, I want to…                                      | Priority |
| -- | ------------------------------------------------------------ | -------- |
| 1  | add, edit and delete products with a price and category      | Must     |
| 2  | tap products to build a cart and change quantities           | Must     |
| 3  | take cash and see the change due                             | Must     |
| 4  | record card or other payments                                | Must     |
| 5  | see a list of past orders and open any receipt               | Must     |
| 6  | see today's total sales and order count                      | Must     |
| 7  | apply a percentage or fixed discount to an order             | Should   |
| 8  | apply a tax rate (inclusive or exclusive)                    | Should   |
| 9  | void or refund an order                                      | Should   |
| 10 | import products from a CSV file                              | Should   |
| 11 | export orders to CSV for a date range                        | Should   |
| 12 | share a receipt as text or a PDF                             | Could    |
| 13 | back up and restore the whole database                       | Should   |
| 14 | search the product grid and filter by category               | Should   |
| 15 | set the shop name, currency and receipt footer               | Must     |
| 16 | use a dark theme                                             | Could    |
| 17 | track stock levels with low-stock warnings                   | Could    |
| 18 | scan barcodes to add items                                   | Won't (v1) |

## 3. Screens and navigation

The app uses Expo Router with a root stack that contains a bottom-tab group.

```
src/app/
├── _layout.tsx                 Root Stack + SQLiteProvider + migrations
├── (tabs)/
│   ├── _layout.tsx             Tab navigator
│   ├── index.tsx               Sell: product grid + cart
│   ├── orders.tsx              Orders: history list, grouped by day
│   ├── products.tsx            Products: catalog management
│   └── reports.tsx             Reports: totals, best sellers
├── checkout.tsx                Modal: payment method, tendered, change
├── order/[id].tsx              Order detail / receipt, void/refund
├── product/[id].tsx            Add/edit product (id = "new" for create)
└── settings.tsx                Shop info, currency, tax, backup/restore
```

### Sell screen layout

- **Phone:** the product grid fills the screen, with a sticky cart bar at the bottom showing the item count and total. Tapping the bar opens the cart sheet, and "Charge" opens checkout.
- **Tablet:** a split view, with the product grid on the left (about 65%) and the live cart on the right (about 35%).

## 4. Architecture

```
┌────────────────────────────┐
│  Screens (src/app)         │  Expo Router routes, layout only
├────────────────────────────┤
│  Components (src/components)│ Presentational UI
├────────────────────────────┤
│  Hooks / state             │  useCart, useProducts, useOrders
├────────────────────────────┤
│  Domain logic (src/lib)    │  money, totals, tax, CSV (pure, tested)
├────────────────────────────┤
│  Data access (src/db)      │  schema, migrations, typed queries
├────────────────────────────┤
│  expo-sqlite               │  on-device SQLite database
└────────────────────────────┘
```

### Key decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Storage | `expo-sqlite` | Relational data (orders → items), reliable, and fast for reporting queries |
| Money | Integer minor units (`price_cents`) | Avoids floating-point rounding errors |
| Cart state | React context + reducer | The cart is short-lived and local, so no state library is needed |
| Order snapshots | Copy name/price into `order_items` | Editing a product never rewrites past receipts |
| IDs | Auto-increment integers, plus a human-readable order number | Simple, and receipts show `#0042` |
| Timestamps | ISO 8601 UTC strings; display in local time | Sorts correctly and is unambiguous in exports |
| Currency formatting | `Intl.NumberFormat` | Built in, and handles locale and currency symbols |
| Migrations | `PRAGMA user_version` with ordered migration steps | No extra dependency |

## 5. Data model

```sql
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sku          TEXT UNIQUE,
  stock        INTEGER,                 -- NULL = not tracked
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           INTEGER NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('completed','voided','refunded')),
  subtotal_cents   INTEGER NOT NULL,
  discount_cents   INTEGER NOT NULL DEFAULT 0,
  tax_cents        INTEGER NOT NULL DEFAULT 0,
  total_cents      INTEGER NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash','card','other')),
  tendered_cents   INTEGER,
  change_cents     INTEGER,
  note             TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE order_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,      -- snapshot
  unit_price_cents  INTEGER NOT NULL,   -- snapshot
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents  INTEGER NOT NULL
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

**Settings keys:** `shop_name`, `currency` (ISO 4217, e.g. `USD`), `tax_rate_bps` (basis points, e.g. `825` = 8.25%), `tax_inclusive` (`0`/`1`), `receipt_footer`, `next_order_number`.

## 6. Pricing rules

All values are integer cents, and rounding is half-up at each step:

1. `line_total = unit_price × quantity`
2. `subtotal = Σ line_total`
3. `discount` = fixed amount, or `round(subtotal × pct)`, capped at the subtotal
4. `taxable = subtotal − discount`
5. Tax:
   - exclusive: `tax = round(taxable × rate)`, `total = taxable + tax`
   - inclusive: `tax = taxable − round(taxable / (1 + rate))`, `total = taxable`
6. Cash: `change = tendered − total`. Checkout is blocked if `tendered < total`.

These rules live in `src/lib/totals.ts` and must have full unit test coverage.

## 7. Import / export formats

**Products CSV (import and export)**

```csv
name,price,category,sku
Espresso,2.50,Coffee,ESP-01
Croissant,3.00,Bakery,
```

- `price` is given in major units and converted to cents on import.
- Unknown categories are created automatically.
- Invalid rows are skipped and listed in an import summary.

**Orders CSV (export):** one row per order item, with the order number, date, status, payment method, item, quantity, unit price, line total and order total.

**Backup:** a copy of the SQLite database file, shared with `expo-sharing`. Restoring validates the schema version before replacing the current database.

## 8. Quality

- **Unit tests** (Jest) for everything in `src/lib`, covering money, totals, tax, CSV parsing and formatting.
- **Database tests** for migrations and queries where practical.
- **Manual QA checklist** on each milestone: iPhone, Android phone, iPad/tablet, light and dark mode, and a large font size.
- **Accessibility:** every button has an accessible label, touch targets are at least 44pt, and Dynamic Type is respected.
- **Performance:** the product grid stays at 60 fps with 500 products (use `FlatList` with stable keys and memoized cells).

## 9. Risks and open questions

| Risk / question | Mitigation / decision needed |
| --------------- | ---------------------------- |
| Data loss if the device is lost | Prompt for a backup weekly, and make backup a single tap |
| Tax rules vary by country | Support one configurable rate in v1; per-product rates later |
| Receipt printing (Bluetooth/thermal) | Out of scope for v1. Investigate native modules later (needs a dev build) |
| Multiple currencies | One currency per shop in v1 |
| Should voids restore stock? | Yes, if stock tracking is enabled |
| Order number reset (daily vs. continuous)? | Continuous by default. Revisit if users ask |
