# SimplePOS

A small, fast point-of-sale app for a biryani restaurant, for Android and iPhone (Expo / React Native).

- **New Order**: tap item tiles to add (tap **−** to remove), then tap **Pending**, **Paid Cash** or **Paid UPI** to save.
- **Orders**: the day's orders. Mark pending orders paid in one tap, and tap an order to edit or delete it (with Undo). Use ◀ ▶ to see earlier days.
- **Summary**: Day / Week / Month totals, cash vs UPI vs pending, and plates sold per item. Tap **Share** to send the summary on WhatsApp.
- **Settings**: edit menu names, prices, colours and order. Turn on the optional Dine-in / Parcel tag, and export or restore a backup.

All data is stored on the phone (SQLite). Export a backup regularly from Settings.

## Run it

```bash
npm install
npx expo start        # scan the QR code with the Expo Go app on your phone
npx expo start --ios  # or open it in the iOS Simulator
```

## Checks

```bash
npm test              # unit tests: summary maths, dates, and the database (real SQLite)
npm run typecheck
npm run lint
```

## Install on a phone permanently

- **Android (free):** `npx eas-cli@latest build -p android --profile preview` builds an `.apk` you can download and install.
- **iPhone:** needs an Apple Developer account. Use `npx eas-cli@latest build -p ios`, then TestFlight.

## Code layout

```
src/app/            screens (Expo Router): (tabs)/index, orders, summary, settings; order/[id] edits an order
src/components/     OrderEditor (shared by New and Edit), ItemTile, OrderCard, Toast, …
src/db/             SQLite schema/migrations, orders, menu, settings, backup
src/lib/            pure logic: dates (day/week/month), summary maths, formatting
```

Schema changes go in `src/db/migrate.ts` as a new `user_version` step.
