# Kite for Android

A native React Native / Expo app, built alongside the Kite web client. Android application ID: `dev.sahban.kite`. The source is MIT licensed; see the repository license. The Expo starter license is retained in `LICENSE`.

This first preview supports the public chronological feed, profiles with posts and replies, exact profile/cast search, conversations, reaction details, quoted casts, image/link previews, native sharing, and system/light/dark themes. Cast menus offer Copy link, Share and Open in Farcaster; your own casts also offer confirmed deletion using the device signer. Deleted casts disappear locally after a successful submission. Settings contains appearance preferences and About Kite. Video embeds autoplay muted on a loop inside the cast preview, one visible video at a time. Inline controls are limited to play/pause at the bottom left and mute at the bottom right, with a non-interactive progress bar below. Tap the video itself for fullscreen. Playback stops when the cast leaves the feed viewport, the screen loses focus, or the app goes into the background.

Farcaster articles are readable in the app. Format-1 casts show an article title and cover in feeds; opening one assembles its author's chain in index order, selects the newest revision of each part, and renders headings, emphasis, lists, blockquotes, tables, code, and inline attachment markers. Missing parts are identified, and continuation links open the root article. Replies and reactions belong to the root cast. Readers use the existing node HTTP API's `formatVersion` and `chain` fields, so the node must expose them. Lookups are bounded to 2,000 author casts with a notice when that limit is reached. HTML and unsupported notation, including LaTeX, remain literal text. Article writing and editing are not supported.

Sign in through Farcaster approval, keep the approved signer in device secure storage, and like/repost or undo reactions as your own account. The app restores that connection after restarting. Compose casts and replies with linked mentions, up to four image/GIF/link embeds, automatic link attachment, and up to 10,000 UTF-8 bytes for all accounts without a Pro check. The composer shows a text-usage bar and embed counter, with image, GIF, and link tools above the keyboard. GIF results load as you scroll. Following feeds remain a planned addition. Recovery-phrase imports, custody operations and fname changes are intentionally outside the mobile scope.

Unfinished casts are saved locally per account and reply/quote context, retained on failure, and cleared after successful publication. Leaving a composer with content offers **Save draft**, **Discard draft**, or **Keep editing**. Open **Drafts** beside the Cast button or **Saved drafts** in Settings to resume or delete unfinished casts, replies, quotes, and cast edits. Draft text and attachment URLs stay on this device; they do not sync between devices.

Profiles offer **Follow / Unfollow** for other accounts and **Edit profile** for your connected account. The editor updates display name, bio, website, profile image, and banner with the device signer; adding or changing a banner requires Farcaster Pro. Images use the existing upload endpoint. Accepted changes update the app immediately without polling the node. If a later field fails to save, accepted fields remain saved and the remaining edits stay in the editor for retry. Username and custody changes are outside the mobile scope.

The **Notifications** tab shows mentions, replies, likes, recasts, and follows, with filters, an unread badge, and cast previews for likes and recasts. Indexed activity announces new updates without moving the current list; pull to refresh to display them, or load older activity. When indexing is unavailable, the app reads available activity from the node. Remote Android push alerts are implemented separately and require the build credentials and worker setup described below; in-app notifications can be tested in Expo Go.

Multiple image, video and ordinary link embeds share a horizontal swipe row; X posts and quoted casts stay full-width below it. Cast images open in a swipeable viewer. Installed Android builds on Android 10+ save original image files directly to `Internal storage/Download/Kite` using MediaStore Downloads, without a folder picker or storage permission. The local `modules/kite-downloads` Expo module is linked when building the app. Expo Go does not include it, so downloads there use a one-time system folder selection: create or select `Download/Kite`, then grant access. Access is remembered; if the folder is deleted or access is revoked, select it again. Older Android devices also use this fallback. Changes to the native module require a new development or release build; the rest of Kite can still be tested in Expo Go.

Miniapp links render the image and launch-button label from `fc:miniapp` metadata (also JSON miniapp metadata in `fc:frame`). Tapping the card opens the target page in Farcaster. This requires the updated `/api/embed` backend to be deployed; older backends continue to show ordinary link previews. Legacy interactive frames are not executed inside Kite.

Your own cast menus include **Post on X**. It opens an X draft with linked X mentions, ordinary links, and quoted-cast links, using the same draft builder as the web client. Image and video embed URLs are omitted, including extensionless media; attach those files manually on X. Mentions without a linked X handle use `@.username (on Farcaster)`.

Your own cast menus also include **Edit cast**. The composer restores text, mentions, all original embeds, and reply/channel context, and shows the previous likes, recasts, and replies. **Delete previous and cast again** prepares and saves the replacement before deleting the original. Engagement does not transfer. Failed attempts retain their exact signed message for retry; unfinished replacements can be resumed from Settings with the same account and signer. Edit drafts and signed replacement messages contain no private keys and are stored in AsyncStorage.

Client attribution uses a bundled registry for Neynar (6131), Warpcast (9152), Firefly (16823), and Kite (925685), including local logos. Update `src/lib/cast-clients.ts` and `assets/clients` when those identities change. Other clients use cached profile data; self-requesting clients share the author's profile request. Signer registration is still resolved before choosing a client identity.

Public X post links render as native quote-style cards with the author, relative time, text, and media thumbnails. Single thumbnails sit to the left of the text; multiple thumbnails sit below it. Cards open the original post on X. The updated `/api/embed` backend reads public embed metadata with an oEmbed fallback; unavailable posts retain a View on X link. Deploy the backend update before testing these cards against an existing server.

## Development

Use Node.js 22.13 or newer. From this directory:

```sh
npm ci
# Copy .env.example to .env if you want to change public app settings.
npm start
```

Use an Android development build or a compatible Expo Go installation. Build a development client with `npx eas-cli@latest build --platform android --profile development`. It uses the separate application ID `dev.sahban.kite.dev`.

The default backend is `https://kite.sahban.dev`. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` for your own distribution. Connection settings and diagnostics are not exposed in the app's user interface. Public environment variables are compiled into the app; never put database credentials, app mnemonics or private API keys there. Appearance settings use AsyncStorage. Signer secrets use Expo SecureStore, encrypted with Android Keystore-backed storage and excluded from Android backup; there is no AsyncStorage fallback for keys. Native sign-in is available in Expo Go and installed Android builds, not the browser layout preview.

The backend must include `/api/mobile/approval` and `/api/mobile/verify`. They reuse the server's existing `FARCASTER_APP_FID` and `FARCASTER_APP_MNEMONIC` (or `FARCASTER_APP_ENV_FILE`). No developer mnemonic belongs in the mobile environment. The phone creates its own signer, signs a short-lived ownership claim, and sends only the public key and proof. Farcaster approval is checked against the registered onchain signer before the account becomes active. Signed reaction messages are submitted from the phone through Kite's existing gateway; success does not trigger post-submission read polling. Signing out deletes the saved device connection and does not revoke the onchain key.

Casting also uses the existing signed-message gateway. The phone uses the same shared cast, URL and mention validation as the web composer and the modern cast builder for four embeds and casts of up to 10,000 UTF-8 bytes for all accounts, without a Pro subscription check. A successful submission displays **Cast published** with a View action; its locally signed content is cached so opening it does not wait for a confirmation read. Images (JPEG, PNG, GIF, WebP, up to 10 MB each) use the existing `/api/images/upload` endpoint with its server-only `IMGBB_API_KEY`; GIF search uses the existing Tenor-backed endpoint. Video URLs can be attached as links; video file uploads are not included. Plain draft content and attachment URLs use AsyncStorage, while signer secrets remain in SecureStore.

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform android
```

## Android builds

The checked-in Expo project belongs to the Kite maintainers. For a fork, change `owner`, `slug`, `android.package` and `extra.eas.projectId` in `app.config.ts` to your own identity, then link your project with `npx eas-cli@latest init`. EAS commands run from this directory. The repository-root `.easignore` uploads only mobile sources and explicitly shared public helpers for mentions, cast/URL validation, Pro status and key-ownership claims, excluding server configuration and credentials.

```sh
# Standalone APK for installation on an Android phone (no development server)
npm run build:preview

# Android App Bundle for Google Play
npm run build:production
```

The production profile creates an AAB, while the preview profile creates an installable APK. Signing credentials stay outside Git and are managed through the Expo project. Production builds can also be generated locally using Expo/Android tooling; see [Expo's local release guide](https://docs.expo.dev/guides/local-app-production/).

Opening `kite://cast/FID/FULL_HASH` and `kite://profile/FID` uses Expo Router. HTTPS Android App Links require the release certificate fingerprint and an `assetlinks.json` on the website; they are not registered yet. Until then, paste HTTPS links into Search.

## Release status

This is an Android test build, not a Play Store release. Before submission, complete device testing, remaining account actions, accessibility checks, the privacy policy, Play Data Safety disclosures and applicable user-generated-content requirements. In-app notifications and Android push delivery are implemented. Remote push requires Firebase/Expo credentials, the updated API and worker, and testing in an installed Android build; see the setup below.

## Push notifications

In an installed Android build, sign in and open **Settings → Push notifications → Enable notifications**. Kite requests Android permission, registers this installation using a claim signed by the account key, and sends mentions, replies, likes, recasts and follows through Expo Push Service. Tapping an alert opens its cast or profile. The browser preview and Expo Go do not offer remote push. Disable alerts in Kite Settings or Android settings; the app reconciles permission and token changes whenever it returns to the foreground. Sign-out first unregisters this phone and requires a network connection while alerts are enabled. Lock-screen text describes the activity without including cast contents.

Android build setup:

1. In Firebase, register the Android packages you build: `dev.sahban.kite` and, for the development variant, `dev.sahban.kite.dev`. Download the matching Firebase client configuration. Supply it as `mobile/google-services.json`, or set the `GOOGLE_SERVICES_JSON` EAS file environment variable. The config uses that variable when present; do not commit service-account private keys.
2. Upload the Firebase **FCM V1 service account key** to the linked Expo project's Android push credentials with `npx eas-cli@latest credentials --platform android`. Use credentials from the same Firebase project as the client configuration. [Expo FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/).
3. Rebuild using `npx eas-cli@latest build --platform android --profile development` (or `preview` / `production`). Adding `expo-notifications` requires a native rebuild; restarting Metro or publishing an OTA update cannot add this module to an existing build.
4. Deploy the API and `feed/worker.mjs` together. The worker migrates the push device and durable queue tables at startup. `DATABASE_URL` is required. When enhanced push security is enabled in Expo, set `EXPO_ACCESS_TOKEN` on the worker only.
5. On a device or Google Play Android emulator, enable alerts, background the app, and create activity from a different Farcaster account. Test a tap from both a backgrounded and fully closed app, denied permission, token renewal, disabled alerts, and sign-out. [Expo push testing](https://docs.expo.dev/push-notifications/push-notifications-setup/).

The worker queues only new activity for registered devices, retries transient send failures with bounded backoff, checks Expo delivery receipts, and disables unregistered tokens. Push delivery is at least once: a crash or ambiguous network failure after provider acceptance can produce a duplicate alert. Provider acceptance does not guarantee delivery to a phone. No historical activity is pushed when a phone first enables notifications. An alert already handed to FCM before disabling/sign-out can still arrive; notification taps are validated against the currently signed-in recipient.
