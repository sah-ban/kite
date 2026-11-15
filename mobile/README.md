# Kite for Android

A native React Native / Expo app, built alongside the Kite web client. Android application ID: `dev.sahban.kite`. The source is MIT licensed; see the repository license. The Expo starter license is retained in `LICENSE`.

This first preview supports the public chronological feed, profiles with posts and replies, exact profile/cast search, conversations, reaction details, quoted casts, image/link previews, native sharing, and system/light/dark themes. Cast menus offer Copy link, Share and Open in Farcaster; your own casts also offer confirmed deletion using the device signer. Deleted casts disappear locally after a successful submission. Settings contains appearance preferences and About Kite. Video embeds autoplay muted on a loop inside the cast preview, one visible video at a time. Inline controls are limited to play/pause at the bottom left and mute at the bottom right, with a non-interactive progress bar below. Tap the video itself for fullscreen. Playback stops when the cast leaves the feed viewport, the screen loses focus, or the app goes into the background.

Sign in through Farcaster approval, keep the approved signer in device secure storage, and like/repost or undo reactions as your own account. The app restores that connection after restarting. Compose casts and replies with linked mentions, up to four image/GIF/link embeds, automatic link attachment and Pro-aware UTF-8 limits. Drafts are saved per account and reply target, retained on failure, and cleared after a successful submission. Following feeds, cast editing and notifications are the next milestone. Recovery-phrase imports, custody operations and fname changes are intentionally outside the mobile scope.

Multiple image, video and link embeds share a horizontal swipe row; quoted casts stay full-width below it. Cast images open in a swipeable viewer. Installed Android builds on Android 10+ save original image files directly to `Internal storage/Download/Kite` using MediaStore Downloads, without a folder picker or storage permission. The local `modules/kite-downloads` Expo module is linked when building the app. Expo Go does not include it, so downloads there use a one-time system folder selection: create or select `Download/Kite`, then grant access. Access is remembered; if the folder is deleted or access is revoked, select it again. Older Android devices also use this fallback. Changes to the native module require a new development or release build; the rest of Kite can still be tested in Expo Go.

Miniapp links render the image and launch-button label from `fc:miniapp` metadata (also JSON miniapp metadata in `fc:frame`). Tapping the card opens the target page in Farcaster. This requires the updated `/api/embed` backend to be deployed; older backends continue to show ordinary link previews. Legacy interactive frames are not executed inside Kite.

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

Casting also uses the existing signed-message gateway. The phone uses the same shared cast, URL and mention validation as the web composer and the modern cast builder for four embeds and 10,000-byte Pro casts. A successful submission displays **Cast published** with a View action; its locally signed content is cached so opening it does not wait for a confirmation read. Images (JPEG, PNG, GIF, WebP, up to 10 MB each) use the existing `/api/images/upload` endpoint with its server-only `IMGBB_API_KEY`; GIF search uses the existing Tenor-backed endpoint. Video URLs can be attached as links; video file uploads are not included. Plain draft content and attachment URLs use AsyncStorage, while signer secrets remain in SecureStore.

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

This is an Android test build, not a Play Store release. Before submission, complete device testing, remaining account actions, accessibility checks, the privacy policy, Play Data Safety disclosures and applicable user-generated-content requirements. Push notification delivery requires its own backend integration; it is separate from the existing indexed notification history.
