# Svarna on Android: Plan

**Goal:** Use Svarna as an Android app on the owner's phone. It talks to the same backend, and the web app stays exactly as it is.

**Decisions (from the owner):**
- **One user:** only the owner, on their own phone. Install the APK directly; no Play Store.
- **Role:** Owner. The owner can already reach every section (`/owner`, `/pos`, `/accountant`, lending), so one login covers everything.
- **Must have:** share the bill to the customer's **WhatsApp as a PDF**.

---

## 1. Approach: Capacitor app that loads the live site ("hosted mode")

Because only one person uses the app and it isn't going on the Play Store, the app does **not** ship its own copy of the UI. It is a thin Android shell (Capacitor) that opens the production site, `https://<your-domain>`, and adds native features (PDF share, back button, status bar) on top.

Why this fits:
- **The app always shows the latest UI.** Deploy the web app as usual and the phone picks it up. The APK only needs rebuilding when native plugins change.
- **No CORS changes and no configurable server address.** The app runs on the same address as the website, so the relative `/api/v1` and Socket.IO calls already work.
- **The web app gets one new feature** (the "Share PDF" button, which is useful on desktop too). Nothing else in web behaviour changes.

Trade-off: the app needs internet to open, just as the website does. The backend needs internet anyway, so this costs nothing in practice.

(The alternative, shipping the UI inside the APK, was left out. It only pays off for Play Store or offline launch, and it needs a configurable server address, CORS changes and an APK rebuild for every UI change.)

---

## 2. Feature: share the invoice PDF on WhatsApp

### What the owner does
Invoice screen → **Share PDF** → the Android share sheet opens → **WhatsApp** → pick the customer → Send. The PDF arrives as a document, named e.g. `Invoice-SV-0123.pdf`, with an optional caption ("Thank you for shopping at <shop>. Invoice SV-0123, ₹1,23,456").

### How it works
New helper `apps/web/src/lib/share-file.ts`:

```ts
export async function shareFile(blob: Blob, filename: string, text?: string) {
  if (Capacitor.isNativePlatform()) {
    // Android app: write to cache, then open the native share sheet
    const { uri } = await Filesystem.writeFile({
      path: filename, data: await blobToBase64(blob), directory: Directory.Cache,
    });
    await Share.share({ files: [uri], text, dialogTitle: 'Share invoice' });
    return;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });   // Chrome on Android/desktop PWA
    return;
  }
  downloadBlob(blob, filename);                        // desktop fallback = today's download
}
```

- Fetches the existing endpoint `GET /billing/invoices/:id/pdf`. **No backend change.**
- `download-pdf.ts` gains `shareInvoicePdf(id, invoiceNumber, caption)` built on this helper. The existing `downloadInvoicePdf` stays as it is.
- Add a **Share PDF** button next to the existing Download button in:
  - `pages/pos/InvoiceDetailPage.tsx` (~line 174)
  - `pages/pos/PosPage.tsx` success toast/dialog after billing (~lines 335 and 1176), the most common moment to send the bill
  - `pages/pos/InvoiceListPage.tsx` row action (~line 66)
- Also make the existing **Download** work inside the app. Android WebView ignores `<a download>`, so on native, `downloadBlob` saves through Filesystem/Share as well.

### Picking the customer's chat automatically (optional, later)
The share sheet can't pre-select a WhatsApp contact for a file. Options if this gets tedious:
1. **Copy the number first:** before opening the share sheet, copy the customer's phone to the clipboard and show "Number copied". WhatsApp's search box accepts a paste. Simple and free.
2. **WhatsApp Cloud API:** the backend already has `whatsapp.client.ts` (sendText/sendImage). It could add `sendDocument` and send the PDF straight to the customer's number. But messages the business starts need a paid utility template, which goes against the "free" approach Share Kit took. **Not recommended for now.**

---

## 3. Other native fixes for the owner screens

| Where | Problem in the app | Fix |
|---|---|---|
| `GstRegisterPage.tsx` GSTR-1 JSON export | `<a download>` ignored | use `shareFile` / `downloadBlob` helper |
| `lending-shared.tsx` lending PDF (`window.open`) | popups blocked in WebView | use `shareFile` (opens the share/"open with" sheet) |
| `ShareKitPage.tsx`, `share-cards.ts` image download/share | `<a download>` ignored; WebView has no `navigator.share` | use `shareFile` |
| Hardware back button | closes the app instead of going back | `@capacitor/app` `backButton` → `history.back()`, exit only on the dashboard |
| PWA service worker | Not needed in the app shell | Harmless in hosted mode. Leave it on. |

`ShareKitPage` links built from `window.location.origin` are already correct in hosted mode, because the origin is the real domain.

---

## 4. Project layout

New workspace `apps/mobile`. Nothing in `apps/web` build config changes.

```
apps/mobile/
  package.json            # @capacitor/cli, core, android, app, filesystem, share, status-bar, splash-screen
  capacitor.config.ts
  android/                # generated by `npx cap add android`, committed
  www/index.html          # tiny placeholder; Capacitor needs a webDir even in hosted mode
  assets/icon.png         # from apps/web/public/icon-512.png → `npx @capacitor/assets generate`
```

`capacitor.config.ts`:
```ts
const config: CapacitorConfig = {
  appId: 'com.svarna.owner',
  appName: 'Svarna',
  webDir: 'www',
  server: {
    url: process.env.SVARNA_URL ?? 'https://<your-domain>',
    androidScheme: 'https',
  },
};
```

`apps/web` gets the Capacitor JS packages as dependencies (`@capacitor/core`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/app`) so the deployed site can call them. On the web, `Capacitor.isNativePlatform()` is `false` and those code paths don't run.

Root scripts:
```jsonc
"android:sync":  "npx cap sync android --cwd apps/mobile",
"android:open":  "npx cap open android --cwd apps/mobile",
"android:apk":   "cd apps/mobile/android && ./gradlew assembleRelease"
```

---

## 5. Phases

**Phase 1: Share PDF (web first, works everywhere)**
- [x] `lib/share-file.ts` (native → Filesystem+Share, browser → Web Share, else download)
- [x] `shareInvoicePdf()` + **Share PDF** buttons on InvoiceDetail, POS success, InvoiceList
- [x] Caption with invoice number and amount (shop name is on the PDF; `/settings` is owner-only so staff POS can't read it); customer phone copied to clipboard
- [x] Helper paths checked in the browser (share, cancel, expired tap, download fallback)
- [ ] Check on the phone: Chrome on Android opens the share sheet → WhatsApp receives the PDF
- [ ] Deploy. *The owner can already use this through Chrome's "Add to Home screen" before the APK exists.*

**Phase 2: Android shell**
- [ ] Install Android Studio (JDK 21, SDK), enable USB debugging on the phone
- [ ] Create `apps/mobile`, add Capacitor + plugins, `cap add android`
- [ ] Back button, status bar colour, splash, icons
- [ ] Debug build on the phone: login, dashboard, live rates, POS billing → Share PDF → WhatsApp

**Phase 3: Remaining file actions**
- [ ] GSTR-1 export, lending PDF, Share Kit images → `shareFile`
- [ ] Check each one on the phone

**Phase 4: Release APK**
- [ ] Create a release keystore (stored outside git, backed up; losing it means uninstalling and reinstalling the app)
- [ ] `assembleRelease` → copy the APK to the phone → install (allow "Install unknown apps" once)
- [ ] Later UI changes: just deploy the web app. Rebuild the APK only when plugins or the app icon change.

**Optional later**
- Mobile layout pass on dense tables (POS cart, registers) and safe-area padding
- Copy the customer's number to the clipboard before sharing

---

## 6. Things to check first
- The production site must be reachable over **HTTPS** from the phone. The Caddy prod setup already does this.
- The phone needs Chrome/Android System WebView to be up to date (Play Store auto-updates it).
