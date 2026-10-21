# Kite (@kiteapp)

**Your people. Your feed.**

Kite is an open source Farcaster client (project name and handle: `kiteapp`) with chronological Following feeds, client filters, rich profiles, notifications, and account tools. It also includes a responsive tutorial for running your own Snapchain read node. MIT licensed.

The client is the homepage at `/`; the tutorial lives at `/guide`. Public profiles live at `/profile/FID`, with social accounts, linked wallets, connected clients, storage usage, and active Pro expiry at `/profile/FID/about`, and conversations at `/cast/FID/FULL_HASH`. The previous `/client` URL opens the homepage for compatibility. The client reads directly from a configured node through a small local gateway. Local account actions are signed in the browser; approved-account actions are signed by the server. Reads and signed submissions use the same configured Snapchain HTTP API.

## Try the client

Home opens the chronological Following feed. Desktop navigation and the mobile bottom bar provide Home, Search, Notifications, and Profile; the account menu opens Settings and account actions. Mobile navigation uses icons, with a centered New cast button between Search and Notifications. On mobile, Home keeps the app header and places refresh after Filters; other screens use their own page headers. Desktop places the Kite brand and theme switch above the left navigation, without a top app header. The guide remains available at `/guide`, linked from Settings alongside node diagnostics and protocol references. Existing `/following` and public FID links continue to work. The feed picker is hidden while indexed feed coverage is limited. Wide desktop screens include a sticky About Kite panel with source code and field guide links.

The composer expands on demand, with one image/GIF/link toolbar and the connected username. Collapsing it, closing the compose dialog, or navigating inside the client retains the current draft. Filter controls show a selection count and removable chips; removing the final filter restores all clients. On mobile, filters open as a bottom sheet capped at 70% of the viewport, with a scrolling body and fixed Reset/Apply controls. Client chips and All/Include/Exclude controls stay compact; custom FIDs and public keys expand on demand. Chronological ordering stays visible beside the filter button.

Unknown URLs show a **Page not found** screen with Home and Search links. Direct visits return HTTP 404, while missing assets and unknown API endpoints keep plain error responses. Invalid profile IDs and incomplete cast routes no longer fall back to Home.

Returning from a cast or profile restores scroll position and loaded feed pages from a bounded in-memory cache. Explicit refresh bypasses that cache; a failed refresh keeps existing posts visible with an inline retry. Success messages appear as dismissible toasts, while likes, recasts, and follows update immediately and roll back on submission failure. These UI updates do not add post-submission confirmation polling. Drafts and navigation memory described here last for the current client session, rather than surviving a browser reload.

From your repository checkout:

```bash
./kite client
```

Open http://127.0.0.1:5173 for Kite or http://127.0.0.1:5173/guide for the tutorial. The first run creates `.env` if it is missing. Configure your node through `HUBURL` for both reads and signed submissions; existing configuration is never overwritten. Node addresses and credentials belong in ignored local configuration. No seed phrase is needed for reads.

## Three-command quickstart on suitable existing compute

To access the guide and read-only client through this server's IP address, run `npm run dev:network` and open `http://SERVER_IP:5173/`. This listens on all interfaces; the normal `npm run dev` remains localhost-only. Account import and signing still require a localhost browser origin. The browser uses the server's read gateway, and the upstream read-node URL stays in the server's local configuration.

First clone this repository. The node host needs Ubuntu 22.04/24.04, Python 3, curl, a public IP, four cores, at least 16 GB RAM, and at least 2 TB free SSD. The script allows 15 GiB reported physical RAM to accommodate a nominal 16 GB VM. The client machine needs Node.js 22.13+ and npm 10+.

```bash
./kite provision --existing
./kite node
./kite client
```

1. Provision checks hardware before installing Docker. It supports an existing Ubuntu server and stops if an installed Docker daemon is inaccessible. If it adds your user to the Docker group, reconnect before continuing. It does not provision a new paid VM.
2. Node resolves the latest stable upstream release on first run, pins that release and image, and starts the canonical mainnet read-node configuration. Later runs retain the same release. Set `SNAPCHAIN_REF=0.x.y` explicitly to change it after reviewing upstream release notes. The full initial sync downloads a very large snapshot and can take hours.
3. Client installs locked dependencies if missing, creates a local-node `.env` if needed, and starts a localhost-only Vite server. The configured node handles both reads and signed submissions. These three shell invocations do not eliminate prerequisite installation, configuration, browser account registration, or initial sync.

Check progress with `./kite status`. Each shard should have advancing heights and a delay approaching zero. The script exits 2 while catching up and 1 when unavailable. A low-delay sample is not proof of sustained health; check it again later.

The official read-node configuration needs inbound UDP 3382 and outbound access to network peers and snapshot storage. Our script binds HTTP 3381 and gRPC 3383 to loopback. It leaves APIs private; it does not change an existing firewall. Configure the host and provider firewalls accordingly.

## Separate client and node machines

On the node host, run the first two commands. On your client machine, clone the repository and establish an SSH tunnel:

```bash
ssh -N -L 3381:127.0.0.1:3381 ubuntu@YOUR-NODE-IP
```

In another terminal, configure `.env` from `.env.example`:

```dotenv
HUBURL=http://127.0.0.1:3381
OPTIMISM_RPC_URL=https://mainnet.optimism.io
```

Then run `./kite client`. Set `NODE_STATUS_URL` explicitly if `./kite status` should inspect a different host. Keep the browser and client server on the machine you control; account import is disabled for non-loopback browser origins.

## Optional AWS provisioning

`infra/aws` contains a Terraform configuration for an Ubuntu VM, a 2,000 GiB encrypted gp3 root disk, an isolated VPC, SSH restricted to your CIDR, and public UDP 3382. It defaults to `m6i.xlarge` in Frankfurt. It has not been applied or validated against a live AWS account in this environment.

Install Terraform 1.6+ and configure AWS credentials locally. Copy `infra/aws/terraform.example.tfvars` to `infra/aws/terraform.tfvars` and enter your SSH **public** key and client IPv4 CIDR. Never put private SSH keys in this file.

```bash
./kite provision --aws
terraform -chdir=infra/aws apply kiteapp.tfplan
```

The first command generates a plan without creating paid resources. Review instance, disk, public IPv4, and egress costs in your AWS account before applying. Applying creates billable infrastructure. SSH to the output address, clone this repository there, then run provision and node on that host. Cloud provisioning is an alternative workflow with more setup, not the existing-host three-command path.

To stop charges when finished, review a Terraform destroy plan before applying it. Terminating this instance deletes its root disk and synced database; copy anything you need first. Terraform state and plan files must stay out of source control.

## Account import and app keys

On hosted origins, account connection explains the signer tools available locally, and Edit profile includes a hint for localhost fname changes. Signer approval identifies the configured requester account by username or FID before creation; that account is shown as the client on casts published using the key. Local custody-phrase registration uses the connected account’s own FID for client attribution.

For a fresh delegated signer without entering the user's custody phrase, choose **Approve a fresh signer in Farcaster**. Configure the server-only `FARCASTER_APP_FID` and `FARCASTER_APP_MNEMONIC`, or set `FARCASTER_APP_ENV_FILE` to an explicitly selected app configuration containing `DEVELOPER_FID` and `DEVELOPER_MNEMONIC`. Only those identity fields are read from that file; its database and hub settings are not imported. Never use a `NEXT_PUBLIC_` or `VITE_` prefix for developer credentials.

Kite generates a fresh Ed25519 key, signs a request with the developer identity, and displays the Farcaster approval link and a locally rendered QR code. The account owner approves in Farcaster. The server checks onchain registration and active storage, then binds the connection to that browser with an HttpOnly, SameSite cookie. The delegated private key is encrypted on disk and is never returned to the browser. No cast, reaction, or follow is sent during approval. Later actions require explicit client interaction.

Approval sessions require localhost or HTTPS. For an HTTPS reverse proxy, set `FREECAST_PUBLIC_URL` to its exact public origin; HTTPS session cookies are Secure. The public HTTP network preview remains read-only. Connections last up to 30 days and survive server restarts. Signing out removes the saved signer and browser session but does not revoke its onchain registration; manage old keys in Farcaster. Pending approval requests expire after ten minutes. This optional flow depends on the Farcaster client approval API; the custody-phrase path below remains available for the contest's independent onboarding flow.

If you already have a registered delegated Farcaster signer, choose **Import existing signer**, enter its FID and 32-byte Ed25519 private key in the localhost client, and set an encryption passphrase. The client derives its public key, checks active Ed25519 registration in the Optimism Key Registry, reads the custody address, and checks active storage before saving an encrypted local copy. This sends only public read requests; it does not require the custody phrase, a new registration transaction, or ETH for gas. Gasless-only signer imports are not yet supported. An Ethereum wallet key or payout-signing key is a different key type.

The **Register a new key with a custody phrase** option remains available for the contest's complete onboarding flow:

An existing FID must have active storage. The imported phrase must derive its current custody address; a verified wallet or recovery address may be different. Default derivation is `m/44'/60'/0'/0/0`, with an adjustable final address index.

1. Choose **Connect account** on localhost.
2. Enter the custody seed phrase and an app-key encryption passphrase of at least 12 characters.
3. Review the derived address, FID, Ed25519 public key, permissions, and 30-day inactivity expiry.
4. Choose **Register app key (gasless)**. The browser submits a custody-authorized `KEY_ADD` message to the configured write node. Signer registration requires no ETH or Optimism transaction.
5. Registration completes when Snapchain accepts the message; no post-submission signer polling is performed.

The account must already exist and have active storage; gasless signer registration does not create an FID or buy storage. This key can publish/delete casts, add/remove likes and recasts, and follow/unfollow accounts. It cannot create other keys or change custody. Its 30-day sliding expiry refreshes when it signs merged messages. The node must support gasless signers and report its current user nonce and capacity through `signersByFid`.

The phrase and custody key stay in browser memory. Public custody lookup calls go to the configured Optimism RPC; the node receives signed Farcaster authorization, never the phrase or custody private key. Only the Ed25519 app key is persisted, encrypted with AES-256-GCM and PBKDF2-SHA256 (310,000 iterations). The registration type is authenticated with the other account metadata. The encryption passphrase is not persisted.

If a write reports **Origin mismatch**, check that `FREECAST_PUBLIC_URL` matches the exact browser origin (scheme, host, and port), then restart the server. For local-only development you can leave it unset. Verified same-origin loopback writes also work when a hosted public URL remains configured.

The encrypted key is saved **before** submission. If the request is interrupted, select **Unlock saved app key** after the node catches up; unlocking checks that the gasless key is still active, unexpired, and has the required scopes. **Lock** ends the active session; **Forget** deletes the local encrypted copy. Neither operation revokes authorization. Gasless revocation uses a `KEY_REMOVE` message, not the Optimism Key Registry; see the [official signer documentation](https://snapchain.farcaster.xyz/guides/writing-messages).

No analytics are added. The optional QR approval flow uses Farcaster's signed-key-request API. Images and videos load from their original hosts; YouTube and Vimeo players load only after Play. Google Fonts are loaded for the visual design. Self-host fonts for a fully disconnected asset path.

## Reading and writing

- Profile feeds are chronological, paginated, and keyed by numeric FID. Following feeds load up to 15 current casts per author in batches of 12; this is intentionally a bounded feed rather than an exhaustive network index.
- A short hash like `0x50184b62` is resolved by paging FID 37's casts and then calling `castById` with `0x50184b62b4c52fd76628713562e1eda3dccaf63d`.
- Casts, replies, likes, recasts, follows, and unfollows are signed with the Ed25519 app key. `dataBytes` is explicitly encoded for Snapchain compatibility.
- Casts, deletions, profile updates, gasless signer registration, follows, and reactions finish when Snapchain accepts their signed message. No post-submission inclusion queries or delays block success. Cast success includes the hash and a view link; rejected submissions retain the draft.
- `HUBURL` is the server-only Snapchain HTTP endpoint for reads and `/v1/submitMessage`. The gateway keeps read requests and signed submissions on separate same-origin routes to enforce method, endpoint, payload-size, and origin checks; both routes target the same configured node.

## Filtering by client

Feed controls offer named choices for Warpcast (FID 9152) and Firefly (FID 16823), plus self-registered clients such as Kite where the signer requester FID equals the cast author FID. Additional requester FIDs and exact Ed25519 public keys can also be entered. Selections combine as alternatives and can be included or excluded. The client resolves registration metadata for each loaded author using onchain signer events and the unified signer endpoint, including supported gasless keys. Unknown keys are dropped by include filters and retained by exclude filters.

Limitations: gasless attribution requires a node that supports the unified signer endpoint; active signer queries cannot attribute old revoked keys; a requester FID alone is not an independently verified application identity. The self-registered option matches a registration pattern rather than proving use of Kite specifically. Exact-key filtering still works. A production indexer could retain historical registry events.

## Development and validation

```bash
npm ci
npm run check
npm run build
npm start
```

`npm start` serves `dist` and the same local gateway on loopback. Tests cover signed protobuf round-trips, signature rejection after tampering, paginated full-hash resolution, attribution metadata, encryption and wrong-password/tampering failures, and enforced read/write routing. They do not send casts, spend gas, or create infrastructure.

`@farcaster/core` remains pinned to 0.15.3 for existing onchain signer operations and reactions. Cast publishing, edit replacements, modern profile fields and custody-phrase registration use the isolated official `@farcaster/core-gasless` alias pinned to core 0.20.0. Both local and approved-account cast signing use its modern builder, including `TEN_K_CAST`, with explicit Snapchain `dataBytes` encoding. The SDK bundles legacy Faker fixture initialization, so a small loader bridges those removed APIs to patched Faker 10.6.0. The tutorial and client are separate chunks.

## Before entering the contest

This is an implementation to test, not a claim of contest qualification. Complete these external steps:

1. Run a full read node on suitable compute and record sync evidence.
2. Verify that the configured node supports signed message submissions.
3. Use an actual funded custody account with storage to register the app key, post, reply, follow/unfollow, and react.
4. Have an independent human follow the tutorial from a clean machine. Use `docs/human-test.md` and fix problems they report.
5. Publish the MIT-licensed repository on GitHub and the tutorial with public access.
6. Have the tester post an honest public endorsement. Submit the three URLs as a reply to the original cast by **24 October 2026 at 14:47:30 UTC**.

## Primary references

- [Snapchain source and hardware requirements](https://github.com/farcasterxyz/snapchain)
- [Official getting started guide](https://snapchain.farcaster.xyz/getting-started)
- [Snapchain node types](https://snapchain.farcaster.xyz/node-types)
- [HTTP API](https://snapchain.farcaster.xyz/reference/httpapi/httpapi)
- [Farcaster core SDK](https://github.com/farcasterxyz/hub-monorepo/tree/main/packages/core)
- [Farcaster contracts](https://github.com/farcasterxyz/contracts)
- [Original contest cast](https://farcaster.xyz/balajis.eth/0x50184b62)

## Cast composer limits

Casts, replies, quotes and cast replacements support four total embeds for all accounts. Regular accounts can publish up to 1,024 UTF-8 bytes; active Pro accounts can publish up to 10,000 UTF-8 bytes. Images, GIFs, links and the quoted cast share those embed slots. The composer shows a byte counter based on the published text (selected mention labels do not consume text bytes), disables publishing above the current limits and keeps the full draft for editing. Pro status is read from `storageLimitsByFid`; the UI updates when the subscription expires. Publishing rechecks Pro for text over 1,024 bytes, and the approved-account server independently verifies it before signing. Four embeds do not require Pro or a subscription lookup. Unavailable Pro status blocks only those extended posts; ordinary casts remain available. No draft text is truncated.

## Profiles and conversations

Open an author's name or avatar to view their profile, biography, Posts/Replies tabs, and paginated follower/following lists at `/profile/FID/followers` and `/profile/FID/following`. These lists open as dedicated pages with shareable URLs. My profile opens the connected account. Click a cast to open its conversation; Replies, Likes, and Recasts tabs show direct replies and the accounts behind reactions. Opening a reply opens its own thread, and parent links let you move back up a conversation. These pages have shareable URLs and support browser back/forward navigation.

Counts come from the read node's current retained messages. A `+` means additional pages remain; it is a lower bound, not a complete total. Load more to read the remaining pages. An unavailable count is shown as `—`, never zero. Offscreen cast counts are deferred, and count requests are cached briefly and limited to three concurrent requests. No third-party engagement index is used.

## Media and link embeds

Regular casts and quoted casts render images with an enlarged viewer, click-to-play native videos and HLS streams, and YouTube/Vimeo players. Nothing starts playing automatically. HLS support is loaded only when needed, and playback depends on the host permitting browser access and the browser supporting the video's codec. Unavailable media keeps an original-source link.

Link cards use Open Graph/Twitter metadata fetched by the server through `/api/embed`. The fetcher restricts destinations to public HTTP(S), pins validated DNS answers, checks redirects, and bounds response size, time, concurrency, and request rate. It forwards no browser credentials and does not execute webpage scripts or embed arbitrary player frames. Previews are cached briefly. Sites that require authentication or block previews fall back to a plain link card.

## Direct HTTPS for testing

The Node server can terminate TLS directly. Set `FREECAST_TLS_CERT` and `FREECAST_TLS_KEY` to local PEM files, `FREECAST_PUBLIC_URL` to the exact HTTPS origin (including a nonstandard port), `FREECAST_HOST=0.0.0.0`, and `PORT` to a free port. Run `npm run build` followed by `npm start` using Node 22.13 or newer. Certificates, private keys, and account credentials belong in ignored local configuration; `.freecast/` is ignored for runtime files.

A self-signed test certificate produces a browser warning that must be accepted before opening the client. Use a trusted certificate for normal deployment. The HTTPS approval flow sets Secure cookies; direct HTTPS writes enforce the configured origin. Public HTTP previews remain available for reading.

## Mentioning accounts

Type `@` in the cast, reply, or quote composer and select an account. Suggestions include loaded profiles; enter a full username (including an ENS username such as `dwr.eth`) to look up another account. Use the arrow keys and Enter, or click a suggestion. Selected mentions are published as Farcaster FIDs, with correct positions even after emoji. Editing a selected username clears its old identity so it must be selected again. A cast supports up to ten mentions.


## Saved signer connections

Approval sessions, including pending requests, are encrypted with AES-256-GCM in `.freecast/sessions/` by default. The server creates a random encryption key and restricts the directory and files to its operating-system user. Set `FREECAST_SESSION_DIR` to use another private directory outside `dist` and `public`. Keep both the encrypted session files and their master key when moving this server. These files are ignored by Git and blocked by the development server.

After a restart, Kite restores the same browser-bound signer and checks its onchain registration and storage before allowing it to be used. Connections expire after 30 days; pending requests expire after ten minutes. Signing out deletes the saved signer for that browser. No message is submitted when a connection is restored. Missing or unreadable encryption data fails closed instead of silently replacing a saved key.

Client attribution reads `requestFid` for gasless keys from `signersByFid` and retains onchain signer metadata for existing clients and older nodes. Custody-phrase registration currently uses the account itself as requester, so its label resolves to that account's username rather than a separate Kite app identity. Attribution caches expire so new keys can become visible.

Notifications are available at `/notifications` for the connected account. With the indexed feed enabled, the same Snapchain event subscriptions collect new mentions, replies, likes, recasts, and follows into PostgreSQL for enrolled accounts, including activity from authors outside their following lists. Notification indexing starts when the worker activates the account; earlier activity is not imported. Replies take precedence over duplicate mentions, self-actions are excluded, and removes, prunes, revocations, and compacted follow removals update the index. Reaction notifications can open older casts even when those casts are absent from the feed cache.

The browser checks for updates every ten seconds while visible and on focus. The navigation badge shows unread activity; visiting Notifications marks activity as read on this browser, separately for each FID. Read times are stored locally and are not synchronized between devices. Older loaded pages stay in place until the reader refreshes changed activity. The API at `GET /api/feed/notifications?fid=<enrolled-fid>` supports `kind`, `cursor`, `summary=true`, and an ISO `since` read time. Reads use public protocol data and do not enroll arbitrary accounts. Notifications expire with the configured feed retention window (30 days by default). Checkpoints commit atomically with notification changes. After a stream gap beyond event retention, saved notifications are cleared and collection starts again to avoid retaining missed removals.

Without the indexed service configured, Notifications retains direct, on-demand node reads: mentions and follows are paginated, while replies and reactions are checked on recent authored casts. This fallback does not run for indexed accounts.

### Image uploads

Set `IMGBB_API_KEY` in the ignored server `.env` and restart Kite. The API key stays on the server; do not prefix it with `VITE_` or `NEXT_PUBLIC_`. Both the development and production server expose the same image upload route.

Use **Add image** in the composer, reply or quote dialog. JPEG, PNG, GIF and WebP files up to 10 MB are supported, with previews and removal before publishing. Casts and replies support up to four images for all accounts; quotes reserve one of those slots for the quoted cast. Image-only casts and replies are supported. Publishing waits until the upload finishes, and failed uploads preserve the draft. Images upload immediately to ImgBB without an expiration setting; removing an attachment from the draft or deleting a cast does not delete the hosted image. The upload endpoint enforces the app origin and limits each connecting IP to 20 attempts per hour (in-memory per server process).

### GIF picker

Use **GIF** beside **Add image** to browse featured GIFs, search, or load more results. Selected GIFs attach directly from Tenor and share the account's four embed slots, with one reserved for a quoted cast; they do not upload to ImgBB. The same picker is available in casts, replies and quotes. Kite uses the `tenor.bhopp.ing` provider from the [GIF miniapp](https://github.com/sah-ban/gif) through its server-side `/api/gifs` route, with a short bounded cache, validated media URLs, and retryable errors. No additional API key is required; availability depends on that third-party provider.

HTTP and HTTPS links typed or pasted into the cast, reply, quote, or edit composer automatically become embeds while remaining in the text. Use **Attach link** to embed a URL without putting it in the text. Remove a preview to keep that URL as text only for the rest of the draft; explicitly attaching the same URL restores its preview. Duplicate URLs are skipped, and removing an automatic URL from the text removes its preview. Previews load after a short typing pause and may fall back to a plain link when metadata is unavailable. Links share slots with images, GIFs, and quoted casts: four total for all accounts, including the quoted cast itself. When slots are full, additional text links remain ordinary text. Both local signing and approved-account signing validate the same HTTP/HTTPS URL and 256-byte limit.


### Edit profile

Open **My profile → Edit profile** to update your display name, bio, profile picture, banner, or website. Pictures and banners accept image URLs or uploads through the configured ImgBB integration. Fname changes have a separate localhost-only flow described below.

Updates use signed `USER_DATA_ADD` messages for the connected FID, and the client reports success for each field when Snapchain accepts it. Multi-field edits are separate messages; an interrupted save can partially succeed and the editor reports how many fields were saved. Profile caches refresh after edits. Display names allow 32 UTF-8 bytes; the other editable values allow 256.

Existing gasless keys without `MESSAGE_TYPE_USER_DATA_ADD` (scope 11) retain their current posting access but cannot edit profiles. New gasless registrations include scope 11 and show profile editing in the permission review. Approved onchain signers support profile edits.

Banner editing requires an active Farcaster Pro subscription. The editor checks `storageLimitsByFid` before enabling banner upload, URL changes, or removal, and rechecks before submitting any save that changes the banner. If Pro status cannot be verified, banner editing stays disabled with a retry option; other profile fields remain available. Existing banners remain visible after a subscription expires.

### Change fname on localhost

Open Kite at `localhost`, `127.0.0.1` or `[::1]`, connect your account, then choose **Edit profile → Change username**. Enter the new fname, custody recovery phrase and derivation index. The phrase stays in browser memory and is cleared from the field before review; it is never stored or sent to Kite, the registry or the RPC. Only signed public username proofs go directly to `fnames.farcaster.xyz`. The phrase must derive the connected FID's current custody address, and the connected app signer must allow profile updates. ENS names use a separate registration process.

Availability, known reserved names, and the registry's [28-day cooldown](https://github.com/farcasterxyz/fname-registry/blob/main/src/transfers.ts) are checked before review and again before submission. The new name's complete transfer history is checked too: a released name can still be cooling down. Review the current and new fnames and custody address, then explicitly confirm the release. Releasing the old name and claiming the new one are separate registry writes; the new name is not reserved by an availability check, and the old name may not be reclaimable for 28 days. Both custody proofs are prepared before releasing anything, with the claim timestamp later than the release.

After claiming, Kite waits for the fname proof on the read node, submits the preferred username (`USER_DATA_ADD`, type 6), and finishes when Snapchain accepts it. A failed release never proceeds to claiming. A failed or ambiguous submission can be retried on the open page: registry ownership is checked first, so confirmed releases or claims are not repeated. If a name is already claimed by this FID, the flow can finish only the preferred-name update. Closing the form discards its in-memory custody key and does not reverse completed transfers; after reopening, enter the same claimed fname to finish a pending profile update. Tests use public fixture keys and mocked transfers only.

The preferred-fname action is restricted to loopback hosts and loopback peers on the server, and independently verifies that the node's proof belongs to the approved FID. Existing hosted approval configuration can remain in `.env` while connecting locally; local and hosted sessions remain bound to their own origins.

Active Farcaster Pro subscriptions display a **PRO** badge beside names in profiles, casts, quotes, notifications, and user lists. Hover or focus the badge to access its expiry description, such as “Expires in 2 months 5 days.” Remaining time uses calendar months and UTC days. Badge lookups share a bounded five-minute cache per node and FID, with at most four concurrent requests. Expired, non-Pro, or unavailable subscriptions do not display a badge; banner editing continues to perform its own fresh subscription checks.

Profiles show the full joined date from the earliest recorded incoming fname transfer to that FID, read through the fixed `fnames.farcaster.xyz/transfers` provider. This fname acquisition date may differ from FID registration. Outgoing transfers and invalid or future timestamps are ignored. History is paginated and cached for five minutes; empty or unavailable histories omit the joined date. ENS-only accounts may have no fname history.

Open **Settings** in the sidebar or visit `/settings` to choose System, Light, or Dark appearance; connect, manage, or lock/sign out of an account; edit your profile; open feed controls; and inspect or refresh connection status. Theme preferences persist on the device and stay synchronized with the header toggle. System appearance follows the device setting. Connection credentials remain server-configured.

### Edit a cast by replacing it

For your own casts, choose **Edit cast** in the three-dot menu. The edit composer restores text and mentions, all URL and quoted-cast embeds, and reply or channel context. It shows the previous cast's likes, recasts, and replies (paginated counts use `+`). URL embeds can be edited or removed; images, GIFs, and links can be added within the account's embed limit.

For your own casts, choose **Post to Twitter** in the three-dot menu while connected as the cast author to open a tweet intent with the full cast text and embedded URLs appended at the end. Structured mentions use each account's linked X username from Snapchain's `USER_DATA_TYPE_TWITTER` (type 8), read through the existing `userDataByFid` profile lookup. The action waits for mentioned accounts to resolve; missing, invalid or unavailable X usernames become Farcaster profile links rather than guessing a Twitter handle. The original cast text and its Farcaster mentions stay unchanged. URLs already present in the text are not appended twice, and quoted casts become Farcaster links. This opens a draft for review; upload images and videos manually on Twitter. No Twitter account connection or automatic publishing is involved. The public `v2/user` API remains used only for follower and following totals.

Profile follower and following totals come from `https://api.farcaster.xyz/v2/user?fid=…` through `/api/profile/counts`, with a one-minute server cache. If that provider is unavailable, the profile falls back to the node's loaded connection counts (`+` when more pages exist). Clicking either count still opens the node-backed followers or following list, which may differ while the services catch up.

The conversation's Likes and Recasts lists show **via @clientusername** for each reaction using that reaction's signer requester. Client links open the requester's profile in Kite; unresolved or missing signers show **Unknown client**. Attribution loads as rows approach the viewport and uses the existing signer cache. The key requester may differ from the app brand.

Profiles show **Connected clients** from the node's unified `signersByFid` endpoint, covering both onchain and gasless keys. Keys are grouped by their requester FID so one client appears once, and expired keys are excluded. Client names and avatars link to their Kite profiles. Active keys with missing requester attribution appear together as **Unknown client**. The list reads all signer pages before displaying results; failures show a retry action. Refreshing the profile reloads connections. This identifies signer requesters, which may differ from app brands, and does not revoke or modify any key.

**Delete previous and cast again** prepares and validates the signed replacement first, submits deletion of the previous cast, then publishes the new cast as soon as the deletion is accepted. Pro requirements are checked before deletion. This is a new cast with a new hash: engagement does not transfer. If deletion fails, no replacement is submitted. If publication fails, the draft and signed replacement remain available on this open page; **Close and keep draft → Resume cast edit** reopens it. Retries reuse the same signed replacement to preserve its hash and skip an already accepted deletion. Accepted replacements are remembered in memory, so repeated completion does not resubmit. No inclusion queries follow either successful submission. Refreshing or closing the browser page discards this in-memory recovery state. Tests use mocked writes and never delete or publish real casts.

## Indexed Following feed

The optional feed service indexes followed authors into PostgreSQL. A worker reads the configured Snapchain node, backfills the most recent 30 days, and consumes events from each message shard. Casts are shared across viewers, and only followed authors are imported. The worker applies cast removals, pruning, and revocations, refreshes follow lists, and resolves onchain and gasless signer attribution for client filtering.

Configure server-only values in `.env`: `DATABASE_URL`, `FREECAST_FEED_FIDS` (comma-separated viewer FIDs), `FREECAST_FEED_HTTP_URL`, and `FREECAST_FEED_GRPC_URL`. Use `https://` for a TLS gRPC connection or `http://` for plaintext. `FREECAST_FEED_HISTORY_DAYS` defaults to 30. `FREECAST_FEED_FIDS` now supplies optional seed viewers, not a whitelist. The worker discovers enrolled viewers from PostgreSQL without restarting. `FREECAST_FEED_MAX_USERS` defaults to 1000 and limits new enrollments while allowing existing users to reconnect. Two follow lists and four author backfill pages are processed concurrently; a failed follow list retries after 30 seconds without blocking others. Each follow list is capped at 20,000 entries. Node addresses and database credentials are operator configuration and are never returned by `/api/config`.

For a local database, set a strong `FREECAST_POSTGRES_PASSWORD`, run `docker compose -p freecast -f compose.feed.yml up -d`, and configure `DATABASE_URL` for the `freecast` database/user on `127.0.0.1:55432`. Database files live in ignored `.freecast/postgres`; back them up separately. Then run `npm run feed:worker` and restart the web server. A service template is provided in `deploy/freecast-feed.service.example`. Run one worker per database; an advisory lock prevents concurrent workers. PostgreSQL must be reachable only by the application and operators.

The first configured viewer is the signed-out feed preview. Connecting an account automatically enrolls its verified FID. Approved sessions enroll through a session-bound endpoint; localhost app keys sign a short-lived, origin-bound enrollment challenge and are checked against active node signer registration. No custody phrase or protocol write is needed. Enrollment is idempotent, and anonymous browsing never enrolls arbitrary FIDs. Already enrolled public FIDs can be viewed through `/following?fid=<fid>`; other anonymous FIDs keep direct reads. A “Your feed” button returns from a public preview to the connected account’s list. Import progress is shown while history is incomplete. Refresh loads the newest indexed page; background checks offer a “New posts available” button without moving the current timeline. Freshness depends on the node and worker catching up. No account signer is required for indexing public data.

`GET /api/feed/following?fid=<enabled-fid>` returns 30 posts, status, and a cursor. Optional `mode=include|exclude`, `clients=<comma-separated-fids>`, `keys=<comma-separated-public-keys>`, `self=true`, and `order=newest|oldest` are applied before pagination. Channels are included; replies are omitted. Cursors bind the viewer, follow-list generation, filter selection, ordering, and insertion ceiling, so newly arriving or backfilled posts do not appear halfway through a browsing session. Follow-list changes require refresh. Each cast is stored once; unknown attribution is excluded by Include and retained by Exclude.

Checkpoints commit atomically with processed events. Imports are idempotent, and deletion tombstones prevent backfill from resurrecting a removed cast. Failed author imports retry independently. Streams reconnect using saved per-shard checkpoints. If a checkpoint is older than two days, the worker clears indexed current state for tracked authors, invalidates old cursors, and rebuilds recent history so missed deletions are not retained. Periodic checks refresh signer metadata and reconcile each author's newest cast page. History is retained for the configured window; this is not a permanent archive or an algorithmically ranked feed.

Run the regular suite with `npm test`. Set `FREECAST_TEST_DATABASE_URL` to run PostgreSQL integration tests as well; they create and remove an isolated temporary schema rather than modifying feed tables.

## Branding and compatibility

The app is Kite, with `kiteapp` as its project name and handle. Use `./kite` for the command-line entry point; `./kiteapp` and `./freecast` remain available for compatibility. Existing deployment identifiers, `FREECAST_*` operator settings, `.freecast/` runtime paths, database table names, browser theme/app-key storage, and session cookies are retained so the rebrand preserves saved keys, approved sessions, feed enrollment, and indexed posts. The GitHub repository URL remains the existing repository URL. Changing the app brand does not change any Farcaster account or registered app identity.
