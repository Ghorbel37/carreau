# Publishing Carreau on Google Play

Everything in the repo is ready; the steps below are the ones only the account owner can do.

## What the repo already provides

| Piece | Where |
| --- | --- |
| App id | `com.ghorbel.carreau` (permanent once published) |
| Store build | `node scripts/build.js app` → `dist/app` → Capacitor (`npm run android:sync`) |
| Signed bundle (AAB) | CI job **Android APK** builds `carreau-play-v1.1.N.aab` when the upload-key secrets exist; download it from the run's artifacts |
| Version | `versionCode` = CI run number, `versionName` = `1.1.<run>` (always increasing) |
| Target / min SDK | 36 / 24 (`android/variables.gradle`) |
| Listing text | `fastlane/metadata/android/en-US/` (title, short and full description, changelog) |
| Icon 512×512, feature graphic 1024×500 | `fastlane/metadata/android/en-US/images/` |
| Phone screenshots 1080×1920 | CI job **Play Store listing** → artifact `play-store-listing-v1.1.N` |
| Privacy policy | `https://ghorbel37.github.io/carreau/privacy.html` (published with the web version) |

## Web and store versions

One codebase, two builds:

| | Web (GitHub Pages) | Store app |
| --- | --- | --- |
| Build | `node scripts/build.js web` | `node scripts/build.js app` |
| Google Play promo | On the menu and results ("Coming soon" until `PLAY_LIVE=1`) | Hidden |
| Rate the app | Hidden | Button on the Stats screen |
| Offline | Service worker + web manifest | Files ship inside the app |
| Back button | – | Pauses in game, resumes on the pause menu, leaves from the menu |
| Haptics | `navigator.vibrate` (Android browsers) | Native Haptics plugin |

Once the listing is public, set `PLAY_LIVE: '1'` in the `env` of the **pages** job so the web promo links to the store.

## One-time setup

1. **Developer account.** Sign up at <https://play.google.com/console> (one-time US$25 fee, identity verification). New personal accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to production.

2. **Upload key.** On your computer (needs a JDK):

   ```sh
   keytool -genkeypair -v -keystore carreau-upload.keystore -alias carreau-upload \
     -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 carreau-upload.keystore > carreau-upload.b64   # macOS: base64 -i carreau-upload.keystore
   ```

   Keep the keystore and passwords safe and **out of the repo**. Play App Signing holds the real app-signing key; this is only the upload key, and Google can reset it if it is lost.

3. **Repository secrets** (GitHub → Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `CARREAU_UPLOAD_KEYSTORE_BASE64` | contents of `carreau-upload.b64` |
   | `CARREAU_UPLOAD_STORE_PASSWORD` | keystore password |
   | `CARREAU_UPLOAD_KEY_ALIAS` | `carreau-upload` |
   | `CARREAU_UPLOAD_KEY_PASSWORD` | key password |

   The next push to `main` produces `carreau-play-v1.1.N.aab` as a run artifact.

## Creating the app in Play Console

1. **Create app**: name *Carreau*, default language English (US), *Game*, *Free*.
2. **Store listing**: copy the texts from `fastlane/metadata/android/en-US/`, upload `icon.png`, `featureGraphic.png` and the screenshots from the `play-store-listing` artifact. Category: *Puzzle*. Contact email: yours.
3. **App content** answers:
   - Privacy policy: `https://ghorbel37.github.io/carreau/privacy.html`
   - Ads: **No ads**
   - App access: **All functionality available without special access**
   - Content rating questionnaire: a puzzle game with no violence, no user content, no purchases → rated for everyone
   - Target audience: 13+ is simplest (choosing under-13 adds Families policy requirements)
   - Data safety: **No data collected, no data shared** (progress is stored only on the device)
   - Government app / financial features / health: **No**
4. **Testing → Closed testing**: create a track, add your testers' emails, upload the `.aab`, roll out. Keep 12+ testers opted in for 14 days.
5. **Production**: apply for production access when the closed test requirement is met, then promote the release.

## Each update

Push to `main`: CI tests, builds the AAB with a higher `versionCode`, refreshes the screenshots and publishes the web version. Upload the new `.aab` in Play Console (or automate it later with the `r0adkll/upload-google-play` action and a service-account key).
