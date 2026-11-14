# Kite for Android

A native React Native / Expo app, built alongside the Kite web client. Android application ID: `dev.sahban.kite`. The source is MIT licensed; see the repository license. The Expo starter license is retained in `LICENSE`.

This first preview supports the public chronological feed, profiles with posts and replies, exact profile/cast search, conversations, reaction details, quoted casts, image/link previews, native sharing, and system/light/dark themes. Settings contains appearance preferences and About Kite. Video embeds open externally in this preview.

Account approval, local signer storage, following feeds, posting, editing, uploads and notifications are the next milestone. This preview cannot connect or publish as an account. Recovery-phrase imports, custody operations and fname changes are intentionally outside the mobile scope.

## Development

Use Node.js 22.13 or newer. From this directory:

```sh
npm ci
npm start
```

Use an Android development build or a compatible Expo Go installation. Build a development client with `npx eas-cli@latest build --platform android --profile development`. It uses the separate application ID `dev.sahban.kite.dev`.

The default backend is `https://kite.sahban.dev`. Developers can set `EXPO_PUBLIC_API_URL` before building their own distribution. Connection settings and diagnostics are not exposed in the app's user interface. Public environment variables are compiled into the app; never put database credentials, app mnemonics or private API keys there. Non-sensitive appearance settings are stored in AsyncStorage. No account keys are collected or stored in this preview.

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform android
```

## Android builds

The checked-in Expo project belongs to the Kite maintainers. For a fork, change `owner`, `slug`, `android.package` and `extra.eas.projectId` in `app.config.ts` to your own identity, then link your project with `npx eas-cli@latest init`. EAS commands run from this directory. The repository-root `.easignore` uploads only mobile sources and the shared UTF-8 mention formatter, excluding server configuration and credentials.

```sh
# Standalone APK for installation on an Android phone (no development server)
npm run build:preview

# Android App Bundle for Google Play
npm run build:production
```

The production profile creates an AAB, while the preview profile creates an installable APK. Signing credentials stay outside Git and are managed through the Expo project. Production builds can also be generated locally using Expo/Android tooling; see [Expo's local release guide](https://docs.expo.dev/guides/local-app-production/).

Opening `kite://cast/FID/FULL_HASH` and `kite://profile/FID` uses Expo Router. HTTPS Android App Links require the release certificate fingerprint and an `assetlinks.json` on the website; they are not registered yet. Until then, paste HTTPS links into Search.

## Release status

This is a browsing preview, not a Play Store release. Before submission, complete device testing, account/signing functionality, accessibility checks, the privacy policy, Play Data Safety disclosures and applicable user-generated-content requirements. Push notification delivery requires its own backend integration; it is separate from the existing indexed notification history.
