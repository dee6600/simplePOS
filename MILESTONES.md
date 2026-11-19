# SimplePOS: Milestones

This is the delivery roadmap. Each milestone produces a working, testable app. Check items off as they land. The design is in [PLANNING.md](PLANNING.md).

**Legend:** ✅ done · 🚧 in progress · ⬜ not started

| Milestone | Theme | Status |
| --------- | ----- | ------ |
| [M0](#m0-project-foundation) | Project foundation | ✅ |
| [M1](#m1-new-order) | New Order | ✅ |
| [M2](#m2-orders-list--editing) | Orders list & editing | ✅ |
| [M3](#m3-summary) | Summary | ✅ |
| [M4](#m4-settings--backup) | Settings & backup | ✅ |
| [M5](#m5-real-phone-trial) | Real-phone trial | 🚧 |
| [M6](#m6-install-on-the-restaurant-phone) | Install on the restaurant phone | ⬜ |
| [v1.2](#v12-money-who-did-it--family-sync) | Money, who did it & family sync | 🚧 |
| [Later](#later-post-v1-ideas) | Post-v1 ideas | ⬜ |

---

## M0: Project foundation

**Goal:** app shell, navigation, database and tooling.

- [x] Expo SDK 58 project with TypeScript strict mode
- [x] Expo Router with routes in `src/app`
- [x] Dependencies: SQLite, file system, document picker, sharing, haptics, vector icons, fonts
- [x] Root `_layout.tsx` with a stack, `SQLiteProvider` and toast provider
- [x] `(tabs)/_layout.tsx` with New Order, Orders, Summary and Settings tabs
- [x] Migration runner using `PRAGMA user_version`, initial schema, and the seeded placeholder menu
- [x] Theme tokens: colours, item tile palette, status colours
- [x] Jest with `jest-expo`; lint, typecheck and `expo-doctor` all passing
- [x] README, planning and milestone docs

---

## M1: New Order

**Goal:** enter an order in a couple of taps. This is the core of the app.

- [x] Grid of large coloured item tiles (2 columns on phones, 3–4 on tablets)
- [x] Tap to add, "−" to remove, quantity badge on each tile
- [x] Live item count and total, plus a Clear button
- [x] **Pending · Paid Cash · Paid UPI** buttons that save and clear in one tap
- [x] Double-tap guard so one tap never saves two orders
- [x] Order numbers restart at #1 each day
- [x] Toast "Order #N saved · status · ₹total" with an EDIT button
- [x] Header shows today's order count and sales
- [x] Haptic feedback on tap and on save

---

## M2: Orders list & editing

**Goal:** review and correct orders quickly.

- [x] Orders tab: one day's orders, newest first, with count, total and pending amount
- [x] All / Pending / Paid filters
- [x] One-tap "Paid Cash" / "Paid UPI" on pending orders
- [x] ◀ ▶ to browse earlier days
- [x] Edit Order screen reusing the New Order editor, with the current status marked
- [x] Delete with a 6-second UNDO toast (soft delete)
- [x] Items no longer on the menu still appear in old orders and can be removed

---

## M3: Summary

**Goal:** answer "how did today, this week, this month go?"

- [x] Day / Week (Mon–Sun) / Month switch with ◀ ▶ browsing
- [x] Total sales, order count and item count
- [x] Cash, UPI and pending totals with order counts
- [x] Plates sold per item, with amounts
- [x] Dine-in / Parcel counts (when the tag is turned on)
- [x] Day-by-day list for week and month, where tapping a day opens it
- [x] Share the summary as text (WhatsApp)
- [x] Unit tests for date ranges and summary maths

---

## M4: Settings & backup

**Goal:** let the owner adjust the app and keep the data safe.

- [x] Menu editor: name, price, colour, show/hide, add, delete, move up/down
- [x] Dine-in / Parcel tag toggle (off by default)
- [x] Restaurant name
- [x] Export backup (JSON through the share sheet)
- [x] Restore backup with validation and a confirmation prompt
- [x] Database tests, including a backup round-trip

---

## M5: Real-phone trial

**Goal:** confirm every tap flow works on a real phone. The simulator check so far only covered how screens look with sample data; the taps have not been tried by hand.

- [x] Every screen renders correctly in the iOS Simulator with sample orders, and the totals match hand calculations
- [ ] Add and remove items on New Order, then save with each of the three status buttons
- [ ] The EDIT button on the "saved" toast opens the right order
- [ ] Mark a pending order paid from the Orders list
- [ ] Edit an order's items and status; delete it, then UNDO
- [ ] Change a menu price and confirm old orders keep the old price
- [ ] Add, hide, reorder and delete a menu item
- [ ] Turn on Dine-in / Parcel and save tagged orders
- [ ] Share a summary to WhatsApp
- [ ] Export a backup to WhatsApp or Drive, then restore it
- [ ] Try it with a large system font size
- [ ] Test on both an Android phone and an iPhone with Expo Go
- [ ] Use it for one real service, and note what slows the owner down

**Done when:** a full day of real orders is entered without problems and the end-of-day summary matches the cash box.

---

## M6: Install on the restaurant phone

**Goal:** a permanent install that doesn't need Expo Go or a computer.

- [ ] Restaurant's real menu names and prices entered in Settings
- [ ] App icon and splash screen (currently the Expo defaults)
- [x] `eas.json` with an Android `preview` profile that builds an `.apk`
- [ ] Build the APK with `npx eas-cli@latest build -p android --profile preview` and install it
- [ ] iPhone (if needed): Apple Developer account, then TestFlight
- [ ] Agree a weekly backup routine

**Done when:** the app is installed on the restaurant phone and used daily.

---

## v1.2: Money, who did it & family sync

**Goal:** track expenses and the cash/bank balance, show who entered what, and let the family's phones share one shop. Setup steps are in [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

**Done (code and tests):**

- [x] Database v2 migration (v1 → v2): `uid` on orders, menu items and money entries; `created_by`; `dirty` upload flag; menu soft delete; `order_items.menu_item_uid`; new `money_entries` and `device_settings` tables
- [x] Money tab: expenses with preset categories (Rice, Chicken, Mutton, Oil, Vegetables & Masala, Packing, Gas, Water, Salary, Rent, Electricity, Other) and an optional note
- [x] Money tab: lump sums **Add money** (in) and **Take out** (out); an opening balance is an "Add money" entry
- [x] Every money entry is Cash or Bank/UPI; edit, and delete with UNDO; ◀ ▶ to browse days
- [x] Running balance: Cash in hand, Bank and Total, with pending orders shown separately as "to collect"
- [x] One-time **Welcome** screen (LoginGate): your phone number and who you are (Mom, Dad, Shree, Dee, or typed); name changeable and number shown in Settings → This phone
- [x] Orders record `created_by`; money entries record `created_by` and `updated_by` ("by Shree · edited by Mom")
- [x] Summary: expenses (total and by category), profit = sales − expenses, lump sums, balance now; all included in the shared text
- [x] Backup format v2 includes money entries; v1 backups still restore, with their orders marked "Imported"
- [x] Family sync with Firebase (free Spark plan): each person signs in once with their own 10-digit mobile number (no PIN, no SMS; turned into an email/password login behind the scenes); one shop per Firebase project (`shops/main`); the first phone into an empty shop uploads, later phones download (use shop data only, or also add this phone's data)
- [x] Live updates, offline-first upload queue, newest edit wins; sync badge in headers; Settings → Family sync with Sync now / Sign out, or a phone number field and **Sign in and sync** when signed out
- [x] Restore backup is blocked while a phone is syncing
- [x] `firestore.rules` (any signed-in user can read/write; signed-out visitors blocked; deliberately simple for family use) and Firebase emulator config
- [x] Tests: upgrade and restore with the real 18 Nov data, Cash/Bank balance, phone-number login, and two-phone sync with an in-memory cloud (live join, newest edit wins, offline upload without duplicates, keep-local vs discard, safe sign-in order). `npm test`: 31 passed, 1 skipped (emulator) at the time of writing
- [x] Emulator test against real Firestore + Auth and the security rules (`npm run test:emulator`): Dad's number creates the shop, Mom's number joins the same shop, live sync both ways with who did it, same number signs in to the same login again, the "this phone already has data" choice, signed-out visitors blocked
- [x] Version 1.2.0 (Android versionCode 2, iOS buildNumber 2)
- [x] iOS Simulator check: a v1.0 install with the real data upgrades in place, and the Money screen works

**Still to do:**

- [ ] Create the Firebase project and fill in `src/sync/config.ts` (FIREBASE_SETUP.md steps 1–5)
- [ ] Rebuild and install the iPhone and Android apps with the Firebase settings
- [ ] Sign in on the shop phone first (the one with the existing data; this uploads it), then on the other phones, each with their own number
- [ ] Real two-phone check: an order saved on one phone appears on the other; in airplane mode, save an order and an expense, then reconnect and check they upload
- [ ] Agree a weekly backup routine (sync isn't a backup)

**Done when:** every family phone shows the same orders and balance, and the cash balance matches the cash box at the end of a day.

---

## Later: post-v1 ideas

These aren't scheduled. Reprioritize them based on how the restaurant uses the app.

- "All pending orders" view across days
- Bill printing, or sharing a bill with the customer
- Customer name or table note on an order
- "Business day ends at" setting for closing after midnight
- Weekly backup reminder
- Sales charts (by day, by hour)
- CSV export for accounting
- Hindi / Telugu labels
- Proper per-person logins (PIN or SMS codes, and a member list in the security rules) if the app is ever made public; today anyone with the app who types any number can open the shop
- Editable expense categories
