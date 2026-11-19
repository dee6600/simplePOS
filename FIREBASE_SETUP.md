# SimplePOS: Family sync setup (Firebase)

Family sync lets every family phone see the same orders, expenses and balance, live. It uses Google Firebase on the **free Spark plan**. You do this setup once, with your own Google account, in about 15 minutes.

**What it costs:** nothing. The Spark plan needs no credit card and never charges you. Its daily limits (20,000 writes, 50,000 reads, 1 GiB stored) are far more than a restaurant uses. If a limit were ever reached, the app keeps working on each phone and syncing resumes the next day.

**How it works, in short:** each family member signs in once with their **own mobile number** and picks their name. There is no PIN and no SMS code (SMS codes would need Firebase's paid Blaze plan). Everyone reaches the same shop: this Firebase project holds exactly one shop. Each phone saves everything on the phone first, then uploads it when there is internet. The newest edit wins if two phones change the same thing.

**Security is deliberately simple**, as the family asked, because only the family has the app: any signed-in phone can read and change the shop's data, and signed-out visitors are blocked. Anyone who has the app and types any 10-digit number can open the shop. If the app is ever shared outside the family, sign-in must be redesigned first (per-person PINs or SMS codes, and a list of who may join).

---

## Part A: Create the Firebase project (on a computer)

Open [console.firebase.google.com](https://console.firebase.google.com) and sign in with your Google account.

### 1. Create the project

1. Click **Create a project** (or **Add project**).
2. Name: `reddys-biryani-pos` (any name works).
3. Google Analytics: turn it **off**. It isn't needed.
4. Click **Create project**, wait, then **Continue**.

### 2. Turn on email/password sign-in

Nobody types an email in the app. Behind the scenes the app turns each phone number into an email/password login (`<91number>@family.simplepos.app`), so this sign-in method must be on.

1. In the left menu: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab and click **Email/Password**.
3. Turn on the **first** toggle (Email/Password) only. Leave "Email link (passwordless sign-in)" off.
4. Click **Save**.

### 3. Create the database

1. In the left menu: **Build → Firestore Database → Create database**.
2. If asked for an edition, choose **Standard edition**.
3. Location: **asia-south1 (Mumbai)**. This can't be changed later.
4. Choose **Start in production mode**, then **Create**.

### 4. Publish the security rules

The rules let any signed-in family member read and write the shop's data, and block everyone who isn't signed in.

1. In **Firestore Database**, open the **Rules** tab.
2. Delete everything in the editor and paste the full contents of `firestore.rules` from this project:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // The family's shop. Any family member signed in to the app (phone number login) can read and write.
       // Signed-out visitors can't. Deliberately simple, as the family asked.
       match /shops/{shopId}/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

3. Click **Publish**.

### 5. Register the app and copy its settings

1. Click the **gear icon → Project settings**, and stay on the **General** tab.
2. Under **Your apps**, click the **Web** icon (`</>`).
3. App nickname: `SimplePOS`. Leave **Firebase Hosting** unticked. Click **Register app**.
4. Firebase shows a `firebaseConfig` block. Copy its six values into `src/sync/config.ts`:

   ```ts
   export const firebaseConfig = {
     apiKey: 'AIza…',
     authDomain: 'reddys-biryani-pos.firebaseapp.com',
     projectId: 'reddys-biryani-pos',
     storageBucket: 'reddys-biryani-pos.firebasestorage.app',
     messagingSenderId: '123456789012',
     appId: '1:123456789012:web:abc123…',
   };
   ```

   You can find these again later under **Project settings → General → Your apps → SimplePOS → SDK setup and configuration → Config**.

These values are **not secret**. They only identify the project. The security rules from step 4 keep signed-out visitors out.

### 6. Rebuild the apps

The Firebase settings are built into the app, so after filling in `src/sync/config.ts` the iPhone and Android apps must be **rebuilt and reinstalled** (see [README.md](README.md#install-on-a-phone)). If you're not the developer, send the values to the developer and wait for the new build.

Until this is done, **Settings → Family sync** says "Family sync is not set up in this version of the app yet".

---

## Part B: Connect the phones

Every phone needs app **v1.2** installed. On first launch each phone shows a one-time **Welcome** screen: **Your phone number** (the person's own 10-digit mobile number) and **Who are you?** (tap Mom, Dad, Shree or Dee, or type a name). You can change the name later in **Settings → This phone**.

**Order:** sign in on the shop phone first if you can. The order is safe either way: only orders and money entries count as the shop's data. If an empty phone happens to sign in first, the shop phone still uploads all its orders when it signs in (it isn't asked to choose), and its menu replaces the empty phone's placeholder menu on every phone.

### 7. The shop phone (the one with the existing orders), first

1. Make sure the phone has internet.
2. Export a backup first, just in case: on v1.0 before updating, or on v1.2 tap **Continue without sync for now**, export from **Settings → Backup**, then sign in from **Settings → Family sync**.
3. Open v1.2. On the **Welcome** screen, enter your phone number and pick your name.
4. Tap **Continue**.

   If the phone already picked a name on an earlier v1.2 build, it won't show the Welcome screen. Go to **Settings → Family sync** instead, enter your phone number and tap **Sign in and sync**.
5. The phone uploads its menu, orders, money entries and settings. The badge under each screen title shows **Uploading N…** and then **Synced ✓**.

### 8. Each other phone

1. Install v1.2 and open it.
2. On the **Welcome** screen, enter **this person's own** phone number and pick their name. Tap **Continue**.
3. If the phone already has orders or money entries, the app asks **"This phone already has data"**:
   - **Use shop data only** (usual choice): this phone's own orders and money entries are removed and the shop's data is downloaded.
   - **Also add this phone's data**: this phone's orders and money entries are added to the shop too. Use this only if they're real orders that aren't on the shop phone.

   The menu and shop settings always come from the shop.
4. Wait for **Synced ✓**. Then save a test order on one phone and check that it appears on the other.

The Welcome screen also has **Continue without sync for now** (for example to export a backup first). If sign-in fails, the app offers **Use without sync for now** too. The phone then works on its own; sign in later from **Settings → Family sync**: enter the phone number and tap **Sign in and sync**.

Signing in again with the same number (for example after reinstalling the app) reaches the same login and the same shop.

---

## Day-to-day

- **Sync badge** under each screen title: **Synced ✓** means everything is uploaded. **Uploading N…** means it's sending now. **Offline · N waiting** means there's no internet; the phone keeps working and uploads automatically when back online. **Sync now** in Settings retries straight away.
- **Who did it:** every order shows who made it, and every expense or lump sum shows who added it and who last edited it ("by Shree · edited by Mom").
- **Order numbers** restart at #1 each day. If two phones save an order at the same moment, both can get the same number. This is only cosmetic; both orders are kept and counted.
- **Settings → This phone** shows the name used on this phone (tap **Change** to switch it) and the phone number it signed in with.
- **Settings → Family sync** shows the sync status, **Sync now** and **Sign out**. Signing out disconnects the phone; its data stays on the phone. When a phone isn't signed in, this section has a phone number field and **Sign in and sync**.
- **Restoring a backup** is blocked while a phone is syncing. Tap **Sign out** under Family sync first.
- **Keep exporting a weekly backup** (Settings → Export backup) to WhatsApp or Google Drive. Sync isn't a backup: a mistaken delete syncs to every phone.
- **Firebase Authentication → Users** lists one user per family member (shown as `<91number>@family.simplepos.app`). Deleting a person's user there only means they must sign in again on their phone.
- **Don't delete the data in Firestore Database.** That deletes the shop for every phone.
- **Never change** `SHOP_ID`, the salt or the email format in `src/sync/shopLogin.ts` once the family is using sync. Existing logins and data would no longer be found.

---

## Troubleshooting

| The app says | What to do |
| ------------ | ---------- |
| Family sync is not set up in this version of the app yet | `src/sync/config.ts` is still empty, or the phone has an old build. Do steps 5 and 6. |
| Enter your 10-digit mobile number. | Type the person's own Indian mobile number, e.g. `98765 43210` (with or without `+91`). |
| Email/Password sign-in is not turned on in the Firebase project (FIREBASE_SETUP.md, step 2). | Do step 2. |
| This number is registered with a different app setup. Ask the developer. | The number already has a login, but with a different password (the salt in `src/sync/shopLogin.ts` was changed, see "Never change" above). The developer can delete that user in **Authentication → Users**, then the person signs in again. |
| The shop data is locked. Check the Firestore security rules (FIREBASE_SETUP.md, step 4). … or, under Status, "Missing or insufficient permissions" | The rules weren't published, or weren't pasted in full. Do step 4. |
| An error under Status that mentions the database not existing | The Firestore database wasn't created. Do step 3. |
| No internet connection. Connect to the internet and try again. | Signing in needs internet. After that, the phone works offline. |
| Too many attempts. Wait a few minutes and try again. | Firebase paused sign-ins after many tries. Wait, then retry. |
| Badge stays on **Offline · N waiting** with internet on | Tap **Sync now** in Settings and read the message under Status. It usually points to one of the rows above. |
