# Kite for Android

A native React Native / Expo app, built alongside the Kite web client. Android application ID: `dev.sahban.kite`. The source is MIT licensed; see the repository license. The Expo starter license is retained in `LICENSE`.

This first preview supports the public chronological feed, profiles with posts and replies, exact profile/cast search, conversations, reaction details, quoted casts, image/link previews, native sharing, and system/light/dark themes. Settings contains appearance preferences and About Kite. Video embeds open externally in this preview.

Sign in through Farcaster approval, keep the approved signer in device secure storage, and like/repost or undo reactions as your own account. The app restores that connection after restarting. Following feeds, composing casts, editing, uploads and notifications are the next milestone. Recovery-phrase imports, custody operations and fname changes are intentionally outside the mobile scope.

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

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform android
```

## Android builds

The checked-in Expo project belongs to the Kite maintainers. For a fork, change `owner`, `slug`, `android.package` and `extra.eas.projectId` in `app.config.ts` to your own identity, then link your project with `npx eas-cli@latest init`. EAS commands run from this directory. The repository-root `.easignore` uploads only mobile sources, the shared UTF-8 mention formatter and the public ownership-claim helper, excluding server configuration and credentials.

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
