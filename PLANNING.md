# SimplePOS: Planning

This document covers what SimplePOS is, who it's for, and how it's built. For the delivery schedule, see [MILESTONES.md](MILESTONES.md).

## 1. Vision

A phone point-of-sale app for a small family biryani restaurant. The owner enters each order on his phone during rush hours, tags it Pending, Paid Cash or Paid UPI, and fixes or deletes orders quickly. At the end of the day he sees how many plates of each item were sold and how much money came in; weekly and monthly summaries show the bigger picture.

It needs no account, subscription or internet connection. Speed and simplicity at the counter come first. More features will be added gradually.

### Users

- The restaurant owner, entering orders on one phone (Android or iPhone)
- The family, reading daily, weekly and monthly summaries (shared on WhatsApp)

### Menu

Small and fixed. Names and prices are editable in the app; these are the starting placeholders:

| Item | Price |
| ---- | ----- |
| Chicken Biryani Half / Full | ₹120 / ₹200 |
| Mutton Biryani Half / Full | ₹180 / ₹320 |
| Chicken 65 | ₹150 |
| Water Bottle | ₹20 |

### Goals

- Save an order in **2–3 taps**: tap the items, then tap one status button.
- Edit, mark paid, or delete an order in one or two taps, with Undo for delete.
- Accurate **per-item plate counts** and **cash / UPI / pending** totals for any day, week or month.
- Work **fully offline**, with data kept on the phone and a one-tap backup.
- Large, high-contrast buttons that are easy to hit in a hurry.

### Non-goals for v1

- Multi-phone sync or a cloud backend
- Printed bills or receipts
- Discounts, taxes, or cash change calculation
- Stock/inventory tracking
- Staff accounts
- Customer names or table numbers

## 2. Features

| #  | Feature | Status |
| -- | ------- | ------ |
| 1  | Tap item tiles to build an order; "−" removes one | ✅ v1 |
| 2  | Save as **Pending**, **Paid Cash** or **Paid UPI** in one tap | ✅ v1 |
| 3  | Order numbers restart at #1 each day and are never reused that day | ✅ v1 |
| 4  | Today's orders list with All / Pending / Paid filters | ✅ v1 |
| 5  | Mark a pending order paid (Cash/UPI) straight from the list | ✅ v1 |
| 6  | Edit any order (items, status, tag) | ✅ v1 |
| 7  | Delete an order with a 6-second Undo | ✅ v1 |
| 8  | Browse orders of earlier days | ✅ v1 |
| 9  | Summary for Day / Week (Mon–Sun) / Month, browsable back in time | ✅ v1 |
| 10 | Summary shows total sales, cash, UPI, pending, plates per item, day-by-day | ✅ v1 |
| 11 | Share a summary as text (WhatsApp, SMS) | ✅ v1 |
| 12 | Optional Dine-in / Parcel tag, hidden unless turned on in Settings | ✅ v1 |
| 13 | Edit menu: name, price, colour, order, hide, add, delete | ✅ v1 |
| 14 | Restaurant name setting | ✅ v1 |
| 15 | Backup export (JSON via share sheet) and restore | ✅ v1 |
| 16 | Cloud sync across phones | Later |
| 17 | Bill printing / sharing a bill | Later |
| 18 | Customer name or table note on an order | Later |
| 19 | "Business day ends at" setting for closing after midnight | Later |
| 20 | Sales charts, CSV export, Hindi/Telugu labels | Later |

## 3. Screens and navigation

The app uses Expo Router: a root stack containing four bottom tabs, plus an Edit screen.

```
src/app/
├── _layout.tsx                 Root Stack + SQLiteProvider (migrations) + ToastProvider
├── (tabs)/
│   ├── _layout.tsx             Tab navigator
│   ├── index.tsx               New Order: item tiles + total + 3 status buttons
│   ├── orders.tsx              Orders: one day's list, filters, quick mark-paid
│   ├── summary.tsx             Summary: Day / Week / Month totals, Share
│   └── settings.tsx            Menu editor, Dine-in/Parcel toggle, name, backup
└── order/[id].tsx              Edit Order: same editor as New Order, plus Delete
```

### New Order layout

- Item tiles fill the screen: 2 columns on phones, 3–4 on tablets. Each tile has its own colour, its name and price, a quantity badge, and a "−" button once added.
- A bottom panel shows the optional Dine-in/Parcel switch, the item count, a Clear button, the total, and three large buttons: **Pending · Paid Cash · Paid UPI**. Tapping one saves the order and clears the screen.
- Confirmations appear as a toast at the **top** of the screen, so they never cover the buttons.

## 4. Architecture

```
┌──────────────────────────────┐
│  Screens (src/app)           │  Expo Router routes; load data on focus
├──────────────────────────────┤
│  Components (src/components) │  OrderEditor, ItemTile, OrderCard, Toast, …
├──────────────────────────────┤
│  Domain logic (src/lib)      │  dates, summary maths, formatting (pure, tested)
├──────────────────────────────┤
│  Data access (src/db)        │  migrations, orders, menu, settings, backup
├──────────────────────────────┤
│  expo-sqlite                 │  on-device SQLite database (simplepos.db)
└──────────────────────────────┘
```

### Key decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Framework | Expo (React Native) + TypeScript | One codebase for Android and iPhone; test instantly with Expo Go |
| Storage | `expo-sqlite`, on the phone only | Offline, fast, relational (orders → items). Cloud sync deferred |
| Money | Whole rupees as integers | No paise on this menu; no rounding errors |
| Payment status | `pending` / `cash` / `upi` | Lets the summary split cash from UPI to tally the cash box |
| Order snapshots | Copy name and price into `order_items` | Menu edits never change past orders or reports |
| Delete | Soft delete (`deleted = 1`) | Makes Undo trivial; deleted orders are excluded everywhere |
| Order numbers | Per day, `MAX + 1` including deleted | Easy to call out; a deleted number isn't reused |
| Timestamps | Milliseconds since epoch, local-day ranges | Simple range queries for day / week / month |
| Week | Monday to Sunday | Common in India |
| State | Screens re-query SQLite on focus; a tiny "data changed" event refreshes open screens after Undo | No state library needed |
| Migrations | `PRAGMA user_version` with ordered steps in `src/db/migrate.ts` | No extra dependency |

## 5. Data model

```sql
CREATE TABLE menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,            -- whole rupees
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1   -- 0 = hidden from the order screen
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no    INTEGER NOT NULL,            -- restarts at 1 each day
  created_at  INTEGER NOT NULL,            -- ms since epoch
  updated_at  INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'cash', 'upi')),
  order_type  TEXT CHECK (order_type IN ('dine_in', 'parcel')),  -- NULL = not tagged
  total       INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_item_id  INTEGER,                   -- no FK: the menu item may be deleted later
  name          TEXT NOT NULL,             -- snapshot
  price         INTEGER NOT NULL,          -- snapshot
  qty           INTEGER NOT NULL
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);

CREATE INDEX idx_orders_created ON orders (created_at);
CREATE INDEX idx_order_items_order ON order_items (order_id);
```

**Settings keys:** `show_order_type` (`0`/`1`, default off) and `restaurant_name` (default "Biryani House").

## 6. Summary rules

These are implemented in `src/lib/summary.ts` and `src/lib/dates.ts`, both unit tested.

1. Only non-deleted orders with `created_at` inside the period count.
2. A day runs from local midnight to midnight. A week runs Monday 00:00 to the next Monday. A month runs from the 1st to the 1st of the next month.
3. `total sales = Σ order.total`, split into **cash**, **UPI** and **pending** by status, each with an order count.
4. Plates per item are summed by `menu_item_id`, so a rename or price change mid-month still counts as one item. The newest name is shown, and amounts use the price at the time of each order.
5. Items are listed in menu order. Items no longer on the menu come last.
6. Week and month views add a day-by-day list (days with orders only, newest first). Tapping a day opens it.

## 7. Backup format

**Export:** every table is written to `simplepos-backup-YYYY-MM-DD.json` and handed to the share sheet (WhatsApp, Google Drive, Files):

```json
{
  "app": "simplepos",
  "version": 1,
  "exported_at": 1795000000000,
  "menu_items": [ … ],
  "orders": [ … ],
  "order_items": [ … ],
  "settings": [ … ]
}
```

**Restore:** pick the file, check that `app` is `"simplepos"` and that all tables are present, confirm with the user, then replace **all** data in one transaction. IDs are kept, so order numbering continues correctly.

## 8. Quality

- **Unit tests** (Jest, `npm test`) for the date ranges, summary maths and formatting.
- **Database tests** run the real SQL in `src/db` against Node's built-in SQLite. They cover migrations, order numbering, edit, delete/undo, menu edits, settings and a backup round-trip.
- **Manual QA** on a real Android phone and iPhone before each install: see the checklist in [MILESTONES.md](MILESTONES.md#m5-real-phone-trial).
- **Accessibility:** touch targets of at least 44pt (tiles 112pt tall, status buttons 68pt), white text on dark tile colours, and accessible labels on every button.

## 9. Risks and open questions

| Risk / question | Mitigation / decision needed |
| --------------- | ---------------------------- |
| Data loss if the phone is lost or reset | Export a backup weekly from Settings. Consider a reminder or cloud sync later |
| Restaurant open past midnight | Late orders count toward the next calendar day. Add a "day ends at" setting if needed |
| Tapping the wrong status in a rush | The toast after saving has an EDIT button. Status can also be changed from the Orders list |
| Only one phone can enter orders | Fine for now. Cloud sync is the first "Later" item if a second phone is needed |
| iPhone install needs an Apple Developer account ($99/yr) | Use Expo Go for testing. Android `.apk` install is free |
| Pending orders from earlier days are easy to miss | Open question: add an "all pending orders" view across days? |
