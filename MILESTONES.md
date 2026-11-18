# SimplePOS: Milestones

This is the delivery roadmap. Each milestone produces a working, testable app. Check items off as they land. The design is in [PLANNING.md](PLANNING.md).

**Legend:** ✅ done · 🚧 in progress · ⬜ not started

| Milestone | Theme | Status |
| --------- | ----- | ------ |
| [M0](#m0-project-foundation) | Project foundation | 🚧 |
| [M1](#m1-product-catalog) | Product catalog | ⬜ |
| [M2](#m2-sell--checkout) | Sell & checkout | ⬜ |
| [M3](#m3-orders--receipts) | Orders & receipts | ⬜ |
| [M4](#m4-reports) | Reports | ⬜ |
| [M5](#m5-import-export--backup) | Import, export & backup | ⬜ |
| [M6](#m6-polish--v10-release) | Polish & v1.0 release | ⬜ |
| [Later](#later-post-v1-ideas) | Post-v1 ideas | ⬜ |

---

## M0: Project foundation

**Goal:** set up the app shell, navigation, database and tooling, with nothing user-facing yet.

- [x] Expo SDK 58 project with TypeScript strict mode
- [x] Expo Router entry and `@/` path alias
- [x] Dependencies installed: SQLite, file system, document picker, sharing, haptics
- [x] Jest configured with `jest-expo`
- [x] README, planning and milestone docs
- [ ] Root `_layout.tsx` with a stack and `SQLiteProvider`
- [ ] `(tabs)/_layout.tsx` with Sell, Orders, Products and Reports placeholders
- [ ] Migration runner using `PRAGMA user_version`, plus the initial schema
- [ ] `src/lib/money.ts` (parse/format cents) with tests
- [ ] Theme tokens: colors, spacing, typography
- [ ] Lint, typecheck and tests passing

**Done when:** the app launches on iOS and Android, all four tabs open, and the database is created on first run.

---

## M1: Product catalog

**Goal:** the seller can set up their products.

- [ ] Product list grouped or filtered by category
- [ ] Add/edit product screen (`product/[id].tsx`) with validation
- [ ] Delete or archive a product (`is_active = 0`)
- [ ] Category management: create, rename, color, reorder
- [ ] Price input that handles locale decimals and stores cents
- [ ] Empty state with a "Add your first product" call to action
- [ ] Data-access functions in `src/db/products.ts`

**Done when:** a seller can create 20 products in 4 categories, and they persist after the app restarts.

---

## M2: Sell & checkout

**Goal:** take a real sale from start to finish. This is the core of the app.

- [ ] Product grid on the Sell tab with category chips and search
- [ ] Cart context and reducer: add, increment, decrement, remove, clear
- [ ] Phone layout: sticky cart bar and cart sheet
- [ ] Tablet layout: split grid and cart
- [ ] `src/lib/totals.ts` covering subtotal, discount and tax, with full test coverage
- [ ] Order-level discount (percentage or fixed)
- [ ] Checkout modal with cash, card and other payment methods
- [ ] Cash tendered with quick-amount buttons and change calculation
- [ ] Save the order and its items in a single transaction
- [ ] Haptic feedback when adding an item and when a sale succeeds
- [ ] Success screen with a "New sale" button

**Done when:** a seller can ring up a 3-item cash sale in under 10 seconds, and the order is saved with correct totals.

---

## M3: Orders & receipts

**Goal:** review and correct past sales.

- [ ] Orders tab: list grouped by day with daily subtotals
- [ ] Filter by date and status
- [ ] Order detail / receipt view (`order/[id].tsx`)
- [ ] Void an order, with a confirmation prompt
- [ ] Refund an order (full refund in v1)
- [ ] Share a receipt as text with `expo-sharing`
- [ ] Shop name and receipt footer from settings

**Done when:** any past order can be found, viewed, shared and voided, and voided orders are excluded from totals.

---

## M4: Reports

**Goal:** answer "how did today go?"

- [ ] Today summary: gross sales, order count, average order value
- [ ] Date-range picker (today, yesterday, last 7 days, this month, custom)
- [ ] Breakdown by payment method
- [ ] Top 10 products by quantity and by revenue
- [ ] Sales-by-hour chart for a single day
- [ ] Report queries tested against seeded data

**Done when:** report totals match the sum of completed orders for any range.

---

## M5: Import, export & backup

**Goal:** get data in and out safely.

- [ ] CSV parser and serializer in `src/lib/csv.ts`, with tests for quoting, commas and newlines
- [ ] Import products from CSV with `expo-document-picker`, and show an import summary
- [ ] Export products to CSV
- [ ] Export orders for a date range to CSV
- [ ] Back up the database file and share it
- [ ] Restore from a backup file, with a schema-version check and confirmation
- [ ] Settings screen: shop name, currency, tax rate and mode, receipt footer

**Done when:** a backup taken on one device restores identically on another.

---

## M6: Polish & v1.0 release

**Goal:** make the app ready for the stores.

- [ ] Onboarding: shop name, currency and optional sample products
- [ ] Accessibility pass covering labels, contrast, 44pt targets and large text
- [ ] Performance check with 500 products and 5,000 orders
- [ ] Error boundaries and friendly error states
- [ ] App icon, splash screen and store screenshots
- [ ] `eas.json` with development, preview and production profiles
- [ ] Internal testing via TestFlight and Play Internal Testing
- [ ] Privacy policy (no data collected, all data stays on the device)
- [ ] Submit with `eas submit`
- [ ] Tag `v1.0.0`

**Done when:** the app is live on the App Store and Google Play.

---

## Later: post-v1 ideas

These aren't scheduled. Reprioritize them based on user feedback.

- Stock tracking with low-stock alerts
- Barcode scanning (`expo-camera`)
- Product variants and modifiers (size, milk, extras)
- Per-product tax rates
- Partial refunds and split payments
- PDF receipts and Bluetooth thermal printing
- Dark theme
- Customer records and tips
- Multi-device sync (optional cloud backend)
- Localization (i18n)
