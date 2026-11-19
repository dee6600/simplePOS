# SimplePOS: Planning

This document covers what SimplePOS is, who it's for, and how it's built. For the delivery schedule, see [MILESTONES.md](MILESTONES.md). For setting up family sync, see [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## 1. Vision

A phone point-of-sale app for a small family biryani restaurant. The owner enters each order on his phone during rush hours, tags it Pending, Paid Cash or Paid UPI, and fixes or deletes orders quickly. At the end of the day he sees how many plates of each item were sold and how much money came in; weekly and monthly summaries show the bigger picture.

Since v1.2 the app also tracks **business expenses** and **money added or taken out**, so it always shows the **cash in hand** and the **bank balance**, and the profit for any period. Every entry shows **who made it**. The family's phones can share one shop through **family sync** (free Firebase plan), so an order saved on one phone shows up on the others.

It needs no subscription. Everything is saved on the phone first, so it works fully offline; internet is only used to sync. Speed and simplicity at the counter come first. More features will be added gradually.

### Users

- The restaurant owner, entering orders on his phone (Android or iPhone)
- The family (Mom, Dad, Shree, Dee), entering orders and expenses on their own phones, and reading the balance and summaries (also shared on WhatsApp)

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
- Record an expense or lump sum in a few taps, and always know **Cash in hand**, **Bank** and **Total**.
- See **who** entered each order, expense and lump sum.
- Work **fully offline**: the internet must never slow down the counter. With family sync on, all phones catch up within seconds once online.
- Large, high-contrast buttons that are easy to hit in a hurry.

### Non-goals (for now)

- Real per-person security or permissions (each person signs in with their own number, but there is no PIN or SMS check, and every signed-in phone can do everything; the name on a phone is a label, not security)
- Printed bills or receipts
- Discounts, taxes, or cash change calculation
- Stock/inventory tracking
- Customer names or table numbers
- Merging two conflicting edits (the newest edit wins)

## 2. Features

| #  | Feature | Status |
| -- | ------- | ------ |
| 1  | Tap item tiles to build an order; "−" removes one | ✅ v1 |
| 2  | Save as **Pending**, **Paid Cash** or **Paid UPI** in one tap | ✅ v1 |
| 3  | Order numbers restart at #1 each day and are never reused that day (on one phone) | ✅ v1 |
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
| 16 | Money tab: expenses with preset categories and a note; **Add money** / **Take out** lump sums; Cash or Bank/UPI; edit, delete with Undo | ✅ v1.2 |
| 17 | Running balance: Cash in hand, Bank, Total; pending orders shown as "to collect" | ✅ v1.2 |
| 18 | One-time Welcome screen (phone number + who you are); orders show who made them; money entries show who added and last edited them | ✅ v1.2 |
| 19 | Summary adds expenses by category, profit, lump sums and balance now (also in the shared text) | ✅ v1.2 |
| 20 | Family sync: sign in with your own phone number (no PIN/SMS), one shop for the whole family, live updates, offline queue, sync badge | ✅ v1.2 |
| 21 | Backup v2 includes money entries; v1 backups still restore | ✅ v1.2 |
| 22 | "All pending orders" view across days | Later |
| 23 | Bill printing / sharing a bill | Later |
| 24 | Customer name or table note on an order | Later |
| 25 | "Business day ends at" setting for closing after midnight | Later |
| 26 | Sales charts, CSV export, Hindi/Telugu labels | Later |
| 27 | Proper per-person logins (PIN or SMS, member list) if the app goes public; editable expense categories | Later |

## 3. Screens and navigation

The app uses Expo Router: a root stack containing five bottom tabs, plus an Edit screen.

```
src/app/
├── _layout.tsx                 Root Stack + SQLiteProvider (migrations) + SyncProvider + ToastProvider + LoginGate
├── (tabs)/
│   ├── _layout.tsx             Tab navigator
│   ├── index.tsx               New Order: item tiles + total + 3 status buttons
│   ├── orders.tsx              Orders: one day's list, filters, quick mark-paid, "by <name>"
│   ├── money.tsx               Money: balance card, Expense / Add money / Take out, one day's entries
│   ├── summary.tsx             Summary: Day / Week / Month totals, expenses, profit, balance, Share
│   └── settings.tsx            This phone, Family sync, menu editor, Dine-in/Parcel toggle, name, backup
└── order/[id].tsx              Edit Order: same editor as New Order, plus Delete
```

- **LoginGate** is a one-time **Welcome** modal shown until a name is saved: **Your phone number** (only when Firebase is configured) and **Who are you?** (Mom, Dad, Shree, Dee, or a typed name), then **Continue**, or **Continue without sync for now**. If sign-in fails it offers **Use without sync for now**.
- **Settings → This phone** shows the name (**Change**) and the signed-in phone number. **Settings → Family sync** shows the status badge, **Sync now** and **Sign out**; when signed out, a phone number field and **Sign in and sync**.
- **SyncBadge** sits under every screen title when family sync is on: **Synced ✓**, **Uploading N…**, **Offline · N waiting** or **Connecting…**.

### New Order layout

- Item tiles fill the screen: 2 columns on phones, 3–4 on tablets. Each tile has its own colour, its name and price, a quantity badge, and a "−" button once added.
- A bottom panel shows the optional Dine-in/Parcel switch, the item count, a Clear button, the total, and three large buttons: **Pending · Paid Cash · Paid UPI**. Tapping one saves the order and clears the screen.
- Confirmations appear as a toast at the **top** of the screen, so they never cover the buttons.

### Money layout

- A dark **Balance now** card: Cash in hand, Bank (UPI), Total, and "+ ₹N still to collect (N pending orders)".
- Three large buttons: **Expense**, **Add money**, **Take out**. Each opens a form: amount, category (expenses only), **Cash** or **Bank / UPI**, and an optional note.
- ◀ ▶ day browsing, the day's totals, and the day's entries, each showing the time and "by Shree · edited by Mom". Tap an entry to edit or delete it (with Undo).

## 4. Architecture

```
┌──────────────────────────────┐
│  Screens (src/app)           │  Expo Router routes; load data on focus
├──────────────────────────────┤
│  Components (src/components) │  OrderEditor, MoneyEntryModal, FamilySyncSection, SyncBadge, …
├──────────────────────────────┤
│  Domain logic (src/lib)      │  dates, summary maths, balance, formatting (pure, tested)
├──────────────────────────────┤
│  Data access (src/db)        │  migrations, orders, menu, money, settings, backup
├──────────────────────────────┤
│  expo-sqlite                 │  on-device SQLite database (simplepos.db): the source of truth
└──────────────────────────────┘
               ▲  ▼  only when family sync is on
┌──────────────────────────────┐
│  Sync (src/sync)             │  SyncProvider → SyncEngine ⇄ FirestoreRemote
├──────────────────────────────┤
│  Firebase Auth + Firestore   │  free Spark plan, region asia-south1 (Mumbai)
└──────────────────────────────┘
```

### How family sync works

- **Login (`src/sync/shopLogin.ts`, `connectShop.ts`):** each person types their own 10-digit Indian mobile number (`98765 43210`, `+91…` or `0…` all work; it's stored as `919876543210`). The app turns it into a Firebase email/password login, `<91number>@family.simplepos.app` with a password derived from the number and a fixed salt. The first sign-in with a number creates that person's login; later sign-ins (e.g. after a reinstall) reach the same login. No PIN, no SMS (SMS OTP needs the paid Blaze plan). The login is kept across restarts (AsyncStorage).
- **One shop per Firebase project:** `SHOP_ID = 'main'`, so every family member's login reaches the same data. Never change `SHOP_ID`, the salt or the email format once in use: existing logins and data would no longer be found.
- **Cloud layout:** `shops/main/{collection}/{uid}`, where the collections are `menu_items`, `orders` (one document per order, with its items embedded), `money` (money entries) and `meta` (a single `settings` document: restaurant name and the Dine-in/Parcel toggle). `firestore.rules` lets any signed-in user read and write, and blocks signed-out visitors. That is deliberately simple, as the family asked: anyone with the app who types any number can open the shop.
- **Upload (offline queue):** every local change sets `dirty = 1` on the row. The engine uploads dirty rows in batches of 400, stamping each document with `synced_at` (server time), and then clears `dirty`, unless the row was edited again meanwhile. Uploads run shortly after any change, when the app returns to the foreground, every 30 seconds, and 15 seconds after a failure.
- **Download (live):** one Firestore listener per collection for documents with `synced_at` after the saved cursor (minus a 1-minute overlap; applying a document twice is harmless). The cursor is saved per collection on the phone.
- **Conflicts:** the copy with the newer `updated_at` wins. Deletes are soft deletes, so they sync like any other edit.
- **One Continue button for every phone:** after signing in, the app checks whether the shop has any orders or money entries (a menu alone doesn't count, so sign-in order can't lose data).
  - **Shop has no orders or money entries yet:** if this phone has some (the shop phone), everything on it is uploaded and any menu left by an earlier empty phone is replaced. If this phone is empty too, it takes the shop's menu (or, if there is none yet, uploads its starting menu).
  - **Shop has data** (later phones): the phone downloads it; the menu and shop settings always come from the shop. If the phone already has its own orders or money entries, it first asks: **Use shop data only** (delete them and download the shop's) or **Also add this phone's data** (keep them and upload them too).
- **Sign out** (Settings → Family sync) stops syncing; the data stays on the phone. Restore backup is blocked while syncing.
- Without Firebase settings in `src/sync/config.ts`, sync is switched off and the app works as a single-phone app.

### Key decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Framework | Expo (React Native) + TypeScript | One codebase for Android and iPhone |
| Storage | `expo-sqlite` on each phone is the source of truth | Offline, fast, relational. The cloud is a mirror used for sync |
| Cloud | Firebase Firestore + Auth, free Spark plan | No server code, no card, live listeners, India region. 20k writes / 50k reads a day is far above our use |
| Sign-in | Each person's own phone number + name, turned into a Firebase email/password login behind the scenes. No PIN, no SMS | What the family asked for: one-time, nothing to remember. SMS OTP would need the paid Blaze plan |
| Shops | Exactly one shop per Firebase project (`SHOP_ID = 'main'`) | Every family login reaches the same data without inviting or linking accounts |
| Security rules | Any signed-in user can read/write `shops/**`; signed-out visitors are blocked | Family-only app; weak on purpose and accepted (see Risks). Must be redesigned if the app is ever made public |
| Row ids | Random UUID `uid` (expo-crypto) on orders, menu items and money entries | Rows made on different phones never collide. The local integer `id` stays for joins |
| Offline queue | `dirty` flag on each row | No separate queue table; survives restarts |
| Conflicts | Newest `updated_at` wins (phone clock) | Rare for this shop; simple and predictable |
| Download cursor | `synced_at` server timestamp | Phone clocks can differ; the server's can't |
| Order documents | One document per order, items embedded | One write per order or edit |
| Money | Whole rupees as integers | No paise on this menu; no rounding errors |
| Payment status | `pending` / `cash` / `upi` | Lets the summary split cash from UPI to tally the cash box |
| Money entries | `kind` = `expense` / `in` / `out`, `method` = `cash` / `bank` | Covers expenses, opening balance, money taken home or deposited |
| Balance | Computed from all orders and entries, never stored | Always consistent after edits, deletes and sync |
| Profit | Sales − expenses; pending counts as sales; lump sums excluded | Lump sums move money, they aren't income or cost |
| Order snapshots | Copy name and price into `order_items` | Menu edits never change past orders or reports |
| Delete | Soft delete (`deleted = 1`) for orders, money entries and menu items | Undo is trivial and deletes sync like edits |
| Order numbers | Per day, `MAX + 1` including deleted | Easy to call out. Two phones saving at the same instant can get the same number; accepted as cosmetic |
| Who did it | `created_by` on orders; `created_by` + `updated_by` on money entries | Enough for "by Shree · edited by Mom" |
| Timestamps | Milliseconds since epoch, local-day ranges | Simple range queries for day / week / month |
| Week | Monday to Sunday | Common in India |
| State | Screens re-query SQLite on focus; a tiny "data changed" event refreshes open screens after Undo or a download | No state library needed |
| Migrations | `PRAGMA user_version` with ordered steps in `src/db/migrate.ts` | No extra dependency |

## 5. Data model

Database version 2 (migration v1 → v2 runs on first launch of v1.2). The v1 → v2 step adds the new columns and tables, gives every existing row a `uid`, and leaves everything `dirty = 1` so it uploads when the phone joins sync.

```sql
CREATE TABLE menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,            -- whole rupees
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,  -- 0 = hidden from the order screen
  uid         TEXT,                        -- v2: sync id (unique)
  updated_at  INTEGER NOT NULL DEFAULT 0,  -- v2
  deleted     INTEGER NOT NULL DEFAULT 0,  -- v2: soft delete
  dirty       INTEGER NOT NULL DEFAULT 1   -- v2: 1 = waiting to upload
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no    INTEGER NOT NULL,            -- restarts at 1 each day
  created_at  INTEGER NOT NULL,            -- ms since epoch
  updated_at  INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'cash', 'upi')),
  order_type  TEXT CHECK (order_type IN ('dine_in', 'parcel')),  -- NULL = not tagged
  total       INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0,
  uid         TEXT,                        -- v2: sync id (unique)
  created_by  TEXT NOT NULL DEFAULT '',    -- v2: phone user name; 'Imported' for v1 backups
  dirty       INTEGER NOT NULL DEFAULT 1   -- v2
);

CREATE TABLE order_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_item_id   INTEGER,                  -- no FK: the menu item may be deleted later
  name           TEXT NOT NULL,            -- snapshot
  price          INTEGER NOT NULL,         -- snapshot
  qty            INTEGER NOT NULL,
  menu_item_uid  TEXT                      -- v2: links the line to a menu item across phones
);

CREATE TABLE money_entries (               -- v2
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         TEXT,                        -- sync id (unique)
  kind        TEXT NOT NULL CHECK (kind IN ('expense', 'in', 'out')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  category    TEXT,                        -- expenses only, e.g. 'Rice'
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  method      TEXT NOT NULL CHECK (method IN ('cash', 'bank')),
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',    -- last editor or deleter
  deleted     INTEGER NOT NULL DEFAULT 0,
  dirty       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings (                    -- shop settings, synced
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);

CREATE TABLE device_settings (             -- v2: this phone only, never synced
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);

CREATE INDEX idx_orders_created ON orders (created_at);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_money_created ON money_entries (created_at);
CREATE UNIQUE INDEX idx_orders_uid ON orders (uid);
CREATE UNIQUE INDEX idx_menu_uid ON menu_items (uid);
CREATE UNIQUE INDEX idx_money_uid ON money_entries (uid);
```

**Shop settings keys:** `show_order_type` (`0`/`1`, default off) and `restaurant_name` (default "Biryani House").

**Device settings keys:** `device_id`, `user_name`, `shop_id` (`main` while signed in), `my_phone` (e.g. `919876543210`), `settings_dirty`, `settings_updated_at`, and `cursor_<collection>` download cursors.

**Expense categories** (fixed list in `src/lib/balance.ts`): Rice, Chicken, Mutton, Oil, Vegetables & Masala, Packing, Gas, Water, Salary, Rent, Electricity, Other.

## 6. Summary and balance rules

These are implemented in `src/lib/summary.ts`, `src/lib/balance.ts` and `src/lib/dates.ts`, all unit tested.

1. Only non-deleted orders and money entries with `created_at` inside the period count.
2. A day runs from local midnight to midnight. A week runs Monday 00:00 to the next Monday. A month runs from the 1st to the 1st of the next month.
3. `total sales = Σ order.total`, split into **cash**, **UPI** and **pending** by status, each with an order count.
4. Plates per item are summed by `menu_item_id`, so a rename or price change mid-month still counts as one item. The newest name is shown, and amounts use the price at the time of each order.
5. Items are listed in menu order. Items no longer on the menu come last.
6. **Expenses** are totalled and grouped by category (largest first). An expense with no category counts as "Other".
7. **Profit = total sales − expenses.** Pending orders count as sales. Lump sums (money added / taken out) are shown separately and are not part of profit.
8. Week and month views add a day-by-day list (days with orders or expenses, newest first). Tapping a day opens it.
9. **Balance** is all-time, not per period:
   - Cash in hand = paid-Cash orders + cash added − cash taken out − cash expenses
   - Bank = paid-UPI orders + bank added − bank taken out − bank expenses
   - Total = Cash + Bank. Pending orders are not in the balance; they're shown as "to collect".
   - An opening balance is entered as an **Add money** entry.

## 7. Backup format

**Export:** every shop table is written to `simplepos-backup-YYYY-MM-DD.json` and handed to the share sheet (WhatsApp, Google Drive, Files). Per-phone `device_settings` are not included.

```json
{
  "app": "simplepos",
  "version": 2,
  "exported_at": 1795000000000,
  "menu_items": [ … ],
  "orders": [ … ],
  "order_items": [ … ],
  "settings": [ … ],
  "money_entries": [ … ]
}
```

**Restore:** pick the file, check that `app` is `"simplepos"` and that the four v1 tables are present, confirm with the user, then replace **all** data in one transaction. IDs are kept, so order numbering continues correctly.

- Version 1 files (from v1.0) are accepted: they have no money entries, their rows get new `uid`s, and their orders get `created_by = 'Imported'`.
- Everything restored is marked `dirty`, so it uploads if the phone later joins family sync.
- Restore is blocked while the phone is syncing (Sign out under Family sync first), so it can't overwrite the shared shop by accident.

## 8. Quality

- **Unit tests** (Jest, `npm test`) for the date ranges, summary and balance maths, formatting, and the phone-number login (accepted number formats, rejected ones, a stable login per number). At the time of writing: 31 passed, 1 skipped (the emulator test).
- **Database tests** run the real SQL in `src/db` against Node's built-in SQLite. They cover migrations, order numbering, edit, delete/undo, menu edits, settings, a backup round-trip, upgrading v1.0 data in place and restoring a v1 backup (using the real 18 Nov backup in `data/`, which is gitignored; skipped if missing), and the Cash/Bank balance.
- **Sync tests** run two simulated phones against an in-memory cloud: shop phone uploads and a family phone joins live, newest edit wins, offline entries uploading later without duplicates, and joining with keep-local vs discard.
- **Emulator test** (`npm run test:emulator`) runs the real phone-number login, Firestore adapter, sync engine and `firestore.rules` against the local Firebase Auth + Firestore emulator: Dad's number creates the shop, Mom's different number joins the same shop, live sync both ways with who did it, signing in again with the same number returns the same login, the "this phone already has data" choice, and signed-out visitors blocked. Needs Java 21.
- **Manual QA** on a real Android phone and iPhone before each install: see the checklists in [MILESTONES.md](MILESTONES.md).
- **Accessibility:** touch targets of at least 44pt (tiles 112pt tall, status buttons 68pt), white text on dark tile colours, and accessible labels on every button.

## 9. Risks and open questions

| Risk / question | Mitigation / decision needed |
| --------------- | ---------------------------- |
| Data loss if a phone is lost or reset | With family sync on, the shop's data is in the cloud and on every phone. Still export a weekly backup: a mistaken delete syncs everywhere |
| Two phones save an order at the same instant | Both orders are kept; they may share an order number. Accepted as cosmetic |
| A phone's clock is wrong | "Newest edit wins" uses phone time. Keep automatic date and time on every phone |
| Weak sign-in security (accepted for family use) | Anyone who has the app and types any 10-digit number can read and change the shop's data; there is no PIN, SMS or member list. Accepted because only the family has the app. Don't share the app outside the family; if it is ever made public, redesign sign-in first (per-person PINs or SMS codes, and member lists in the rules) |
| The wrong phone signs in first | Handled: only orders and money entries count as shop data, so the shop phone still uploads everything and its menu replaces an empty phone's placeholder menu (tested) |
| `SHOP_ID`, salt or email format changed after use | Existing logins and data would no longer be found. Never change them in `src/sync/shopLogin.ts` once the family uses sync |
| Free plan limits (20k writes / 50k reads a day, 1 GiB) | Far above a restaurant's use. If ever reached, phones keep working offline and catch up the next day. The Spark plan never charges |
| Firebase settings not filled in, or old build installed | Settings → Family sync says it isn't set up. The app still works on one phone |
| Restaurant open past midnight | Late orders count toward the next calendar day. Add a "day ends at" setting if needed |
| Tapping the wrong status in a rush | The toast after saving has an EDIT button. Status can also be changed from the Orders list |
| iPhone install with a free Apple personal team expires after 7 days | Reinstall weekly from the Mac, or pay for an Apple Developer account ($99/yr) for TestFlight. Android `.apk` install is free |
| Expense categories are a fixed list | "Other" plus the note covers anything else. Editable categories are a "Later" idea |
| Pending orders from earlier days are easy to miss | The Money tab shows the total still to collect. Open question: add an "all pending orders" view across days? |
