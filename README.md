# SimplePOS

A small, fast point-of-sale app for a biryani restaurant, for Android and iPhone (Expo / React Native). Version 1.5.

- **New Order**: tap item tiles to add (tap **−** to remove), then tap **Paid Cash** or **Paid UPI** to save. (v1.3 removed Pending: every order is paid when it's saved.)
- **Orders**: the day's orders, each showing who made it. Tap an order to edit or delete it (with Undo). Use ◀ ▶ to see earlier days.
- **Money**: the running balance (**Cash in hand**, **Bank**, **Total**). Record **Expenses** (Rice, Chicken, Oil, Gas, Salary, …), **Add money** (e.g. the opening balance) and **Take out**, each as Cash or Bank/UPI. Tap an entry to edit or delete it (with Undo).
- **Stock**: the day's kitchen record. Biryani cards (Hyderabadi, Tandoor): **Cooked** and **Left** in kg, **Staff** portions in grams, and Sold ≈ cooked − left − staff next to the plates sold. **Kept at home** (rice, barista, oil): **Bought** from the vendor or **Sent to shop**, with the stock left now and a low-stock warning. **Bought today** (chicken, vegetables). A purchase can also save its expense in Money. **Edit stock items** adds or renames items.
- **Summary**: Day / Week / Month or any **Dates** range (From / To) of sales, cash vs UPI, **cash in hand and UPI after expenses**, plates sold per item, expenses by category, the kitchen totals, profit (sales + money added − expenses; money taken out doesn't reduce profit), lump sums and the balance now. Tap **Share** to send it on WhatsApp.
- **Settings**: this phone's user name and phone number, family sync (status, Sync now, Sign out, which app version each phone is on), **Check for app update**, menu names, prices, colours and order, the optional Dine-in / Parcel tag, and backup export / restore.

Each phone shows a one-time **Welcome** screen: the person's own phone number (when family sync is set up) and who they are (Mom, Dad, Shree, Dee, or a typed name). Orders record who made them; expenses and lump sums record who added them and who last edited them.

## Family sync

The family's phones can share one shop through Google Firebase (free Spark plan, no card needed). Each person signs in once with their **own 10-digit mobile number** and picks their name. There is no PIN and no SMS code (SMS would need the paid Blaze plan). Behind the scenes the number becomes a Firebase email/password login (`<91number>@family.simplepos.app`), so nobody types an email. The Firebase project holds exactly one shop (`shops/main`), so every login reaches the same data. Sign in on the shop phone first: the first phone into an empty shop uploads its data, and later phones download it. Changes appear live on every phone.

Only numbers on the family list can use the shop: `firestore.rules` checks a Firestore collection `members` (one document per person, added by the owner in the Firebase console; the app can never read or change it). Any other number gets "This phone number is not on the family list yet", and signed-out visitors are blocked. The Firebase settings live in a private `.env.local` file that is never committed, so the public code isn't connected to the family's shop. Sign-in is still simple (no PIN or SMS): someone who knows a family member's number and has the private settings could sign in as them, which is accepted for family use. If the app is ever shared outside the family, add per-person PINs or SMS codes first.

Everything is saved on the phone first (SQLite), so the app works offline. Changes wait in a queue and upload when there's internet. The badge under each screen title shows **Synced ✓**, **Uploading N…** or **Offline · N waiting**. If two phones edit the same thing, the newest edit wins.

Setup, step by step: **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**. In short: create the Firebase project, add the family's numbers to `members`, publish `firestore.rules`, then copy `.env.example` to `.env.local` and fill in the six values from the Firebase web app config. Without `.env.local` (for example, a build of the public GitHub code) sync is off and the app works as before, on one phone with its own data. Export a backup from Settings every week either way.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: fill in the Firebase values for family sync (FIREBASE_SETUP.md)
npx expo start        # dev server (Expo Go or a development build)
npx expo start --ios  # or open it in the iOS Simulator
```

v1.3 adds `expo-updates` (online updates, below). Like v1.2's native modules, it only reaches a phone through a new build, not through Expo Go.

## Checks

```bash
npm test              # unit + database tests (real SQLite), incl. the real 18 Nov data in data/, phone-number login and two-phone sync tests
npm run test:emulator # real Firestore + Auth emulator test (needs Java 21, see below)
npm run typecheck
npm run lint
```

- The real-data test uses `data/simplepos-backup-2026-11-18.json`. `data/` is gitignored (business data), so the test is skipped when the file isn't there.
- `npm test` currently shows 33 passed and 1 skipped (the emulator test, which only runs under `npm run test:emulator`).
- The two-phone sync tests in `npm test` use an in-memory cloud. `npm run test:emulator` runs the real phone-number login and sync code against a local Firebase Auth + Firestore emulator, including `firestore.rules`: Dad's number creates the shop, Mom's number joins the same shop, changes sync live both ways with who did them, signing in again with the same number returns the same login, a phone with its own orders is asked what to do, a number not on the family list is refused ("not on the family list"), nobody can read `members`, and signed-out visitors are blocked. It needs Java 21, e.g. Android Studio's bundled JDK:

  ```bash
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  ```

## Install on a phone

The Firebase settings in `.env.local` are compiled into the app. After filling them in or changing them, rebuild and reinstall both apps. Git ignores `.env.local` (`.env*.local` in `.gitignore`), but `.easignore` (a copy of `.gitignore` without that line) makes EAS builds, in the cloud and with `--local`, include it.

**iPhone** (free personal team; the install must be repeated every 7 days). Connect the iPhone and find its UDID with `xcrun devicectl list devices`:

```bash
npx expo prebuild -p ios   # only if ios/ is missing
xcodebuild -workspace ios/SimplePOS.xcworkspace -scheme SimplePOS -configuration Release \
  -destination id=<UDID> -derivedDataPath ios/build -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> ios/build/Build/Products/Release-iphoneos/SimplePOS.app
```

**Android** (free) builds an `.apk` you install on the phone. Gradle needs Java 17+ and the Android SDK; use Android Studio's (`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME="$HOME/Library/Android/sdk"`):

```bash
npx eas-cli build -p android --profile preview --local   # build on this computer
npx eas-cli build -p android --profile preview           # or build in the Expo cloud
```

Both use the same Expo-managed signing key, so a local build installs as an update over a cloud-built app (no data loss).

**GitHub releases:** an `.apk` or `.app` built with `.env.local` contains the family's Firebase settings. Don't attach it to a GitHub release unless the repository is private; share it with the family directly instead.

Version: 1.3.0 (Android versionCode 3, iOS buildNumber 3, runtimeVersion 1), set in `app.json`. Bump both build numbers for each new build; online updates don't need a new number.

## Online updates (v1.3+)

Phones running a v1.3 build (or newer) update themselves over the internet with **EAS Update** (free plan: up to 1,000 phones a month). No cable, no APK.

```bash
npm run publish-update -- "Fixed the summary total"
```

The script runs the tests and typecheck and builds the update on this Mac, where `.env.local` is loaded. It checks that the Firebase settings made it into both bundles, then publishes to the `preview` channel, which the APK and the iPhone builds listen to. If the settings are missing it stops without publishing, because an update without them would switch sync off on every phone.

Each phone downloads the update in the background when the app opens and switches to it the **next** time the app is opened. **Settings → Check for app update** downloads it and restarts right away. **Settings → Family sync → Which app version is each phone on?** lists each phone's version and marks the ones that need an update.

What can and can't go out online:

- **Online:** screens, wording, calculations, anything in `src/`.
- **Needs a new APK / iPhone build:** a new library with native code, or native settings in `app.json` (icon, name, permissions). For that build, raise `"runtimeVersion"` in `app.json` (now `"1"`). Phones still on the old build keep running their version and never receive an update they can't run.
- **Older phones keep working:** an update reaches phones at different times, and v1.2 phones can't update online at all. So the synced data must stay readable by older versions: add fields, but never rename or remove them, and don't change `firestore.rules` in a way that blocks an older version. v1.2 and v1.3 phones sync together fine. A v1.2 phone can still save a Pending order; v1.3 shows it as **Not paid**, with Cash / UPI buttons to settle it.
- The iPhone free-team install still expires after 7 days, whatever the online updates; reinstall it from this Mac.

## Code layout

```
src/app/            screens (Expo Router): (tabs)/index, orders, money, stock, summary, settings; order/[id] edits an order; stock-items edits the stock list
src/components/     OrderEditor, MoneyEntryModal, FamilySyncSection, LoginGate, SyncBadge, OrderCard, Toast, …
src/db/             SQLite schema/migrations, orders, menu, money, settings, backup
src/lib/            pure logic: dates, summary maths, stock maths, balance, formatting
src/sync/           family sync: phone-number login (shopLogin, connectShop), engine (upload queue + live download), mapping, Firestore adapter, config (reads .env.local)
firestore.rules     cloud security rules: only numbers in the members list (paste into the Firebase console)
.env.example        template for the private .env.local (Firebase settings; never committed)
```

Schema changes go in `src/db/migrate.ts` as a new `user_version` step. Design notes are in [PLANNING.md](PLANNING.md); progress is in [MILESTONES.md](MILESTONES.md).
