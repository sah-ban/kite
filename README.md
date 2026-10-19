# Freecast

A local Farcaster client and a responsive tutorial for running your own Snapchain read node. MIT licensed.

The client is the homepage at `/`; the tutorial lives at `/guide`. Public profiles live at `/profile/FID`, and conversations at `/cast/FID/FULL_HASH`. The previous `/client` URL opens the homepage for compatibility. The client reads directly from a configured node through a small local gateway. It signs protocol messages in the browser and submits them to a separately configured validator.

## Try it on this machine

This development machine has about 8 GB RAM and 20 GB free disk: enough for the client, far below the read node's capacity requirements. No node has been provisioned here.

```bash
cd /root/projects/freecast
./freecast client
```

Open http://127.0.0.1:5173 for the client or http://127.0.0.1:5173/guide for the tutorial. The first run creates `.env` pointing at a node on localhost. This development machine needs an existing remote node: configure `NEXT_PUBLIC_HUBURL` in your local `.env` before starting. Existing `.env` files are never overwritten. Endpoint URLs belong in local configuration, not in source control. `VALIDATOR_URL` is empty by default: configure a real validator HTTP endpoint to enable posting. No seed phrase is needed for reads.

## Three-command quickstart on suitable existing compute

To access the guide and read-only client through this server's IP address, run `npm run dev:network` and open `http://SERVER_IP:5173/`. This listens on all interfaces; the normal `npm run dev` remains localhost-only. Account import and signing still require a localhost browser origin. The browser uses the server's read gateway, and the upstream read-node URL stays in the server's local configuration.

First clone this repository. The node host needs Ubuntu 22.04/24.04, Python 3, curl, a public IP, four cores, at least 16 GB RAM, and at least 1.5 TB free SSD. The script allows 15 GiB reported physical RAM to accommodate a nominal 16 GB VM. The client machine needs Node.js 22.13+ and npm 10+.

```bash
./freecast provision --existing
./freecast node
./freecast client
```

1. Provision checks hardware before installing Docker. It supports an existing Ubuntu server and stops if an installed Docker daemon is inaccessible. If it adds your user to the Docker group, reconnect before continuing. It does not provision a new paid VM.
2. Node resolves the latest stable upstream release on first run, pins that release and image, and starts the canonical mainnet read-node configuration. Later runs retain the same release. Set `SNAPCHAIN_REF=0.x.y` explicitly to change it after reviewing upstream release notes. The full initial sync downloads a very large snapshot and can take hours.
3. Client installs locked dependencies if missing, creates a local-node `.env` if needed, and starts a localhost-only Vite server. Set the validator URL before account actions. These three shell invocations do not eliminate prerequisite installation, configuration, browser account registration, or initial sync.

Check progress with `./freecast status`. Each shard should have advancing heights and a delay approaching zero. The script exits 2 while catching up and 1 when unavailable. A low-delay sample is not proof of sustained health; check it again later.

The official read-node configuration needs inbound UDP 3382 and outbound access to network peers and snapshot storage. Our script binds HTTP 3381 and gRPC 3383 to loopback. It leaves APIs private; it does not change an existing firewall. Configure the host and provider firewalls accordingly.

## Separate client and node machines

On the node host, run the first two commands. On your client machine, clone the repository and establish an SSH tunnel:

```bash
ssh -N -L 3381:127.0.0.1:3381 ubuntu@YOUR-NODE-IP
```

In another terminal, configure `.env` from `.env.example`:

```dotenv
NEXT_PUBLIC_HUBURL=http://127.0.0.1:3381
VALIDATOR_URL=https://YOUR-VALIDATOR-HTTP-ENDPOINT
OPTIMISM_RPC_URL=https://mainnet.optimism.io
```

Then run `./freecast client`. Set `NODE_STATUS_URL` explicitly if `./freecast status` should inspect a different host. Keep the browser and client server on the machine you control; account import is disabled for non-loopback browser origins.

## Optional AWS provisioning

`infra/aws` contains a Terraform configuration for an Ubuntu VM, a 2,000 GiB encrypted gp3 root disk, an isolated VPC, SSH restricted to your CIDR, and public UDP 3382. It defaults to `m6i.xlarge` in Frankfurt. It has not been applied or validated against a live AWS account in this environment.

Install Terraform 1.6+ and configure AWS credentials locally. Copy `infra/aws/terraform.example.tfvars` to `infra/aws/terraform.tfvars` and enter your SSH **public** key and client IPv4 CIDR. Never put private SSH keys in this file.

```bash
./freecast provision --aws
terraform -chdir=infra/aws apply freecast.tfplan
```

The first command generates a plan without creating paid resources. Review instance, disk, public IPv4, and egress costs in your AWS account before applying. Applying creates billable infrastructure. SSH to the output address, clone this repository there, then run provision and node on that host. Cloud provisioning is an alternative workflow with more setup, not the existing-host three-command path.

To stop charges when finished, review a Terraform destroy plan before applying it. Terminating this instance deletes its root disk and synced database; copy anything you need first. Terraform state and plan files must stay out of source control.

## Account import and app keys

For a fresh delegated signer without entering the user's custody phrase, choose **Approve a fresh signer in Farcaster**. Configure the server-only `FARCASTER_APP_FID` and `FARCASTER_APP_MNEMONIC`, or set `FARCASTER_APP_ENV_FILE` to an explicitly selected app configuration containing `DEVELOPER_FID` and `DEVELOPER_MNEMONIC`. Only those identity fields are read from that file; its database and hub settings are not imported. Never use a `NEXT_PUBLIC_` or `VITE_` prefix for developer credentials.

Freecast generates a fresh Ed25519 key, signs a request with the developer identity, and displays the Farcaster approval link and a locally rendered QR code. The account owner approves in Farcaster. The server checks onchain registration and active storage, then binds the connection to that browser with an HttpOnly, SameSite cookie. The delegated private key is encrypted on disk and is never returned to the browser. No cast, reaction, or follow is sent during approval. Later actions require explicit client interaction.

Approval sessions require localhost or HTTPS. For an HTTPS reverse proxy, set `FREECAST_PUBLIC_URL` to its exact public origin; HTTPS session cookies are Secure. The public HTTP network preview remains read-only. Connections last up to 30 days and survive server restarts. Signing out removes the saved signer and browser session but does not revoke its onchain registration; manage old keys in Farcaster. Pending approval requests expire after ten minutes. This optional flow depends on the Farcaster client approval API; the custody-phrase path below remains available for the contest's independent onboarding flow.

If you already have a registered delegated Farcaster signer, choose **Import existing signer**, enter its FID and 32-byte Ed25519 private key in the localhost client, and set an encryption passphrase. The client derives its public key, checks active Ed25519 registration in the Optimism Key Registry, reads the custody address, and checks active storage before saving an encrypted local copy. This sends only public read requests; it does not require the custody phrase, a new registration transaction, or ETH for gas. Gasless-only signer imports are not yet supported. An Ethereum wallet key or payout-signing key is a different key type.

The **Register a new key with a custody phrase** option remains available for the contest's complete onboarding flow:

An existing FID must have active storage. The imported phrase must derive its current custody address; a verified wallet or recovery address may be different. Default derivation is `m/44'/60'/0'/0/0`, with an adjustable final address index.

1. Choose **Connect account** on localhost.
2. Enter the custody seed phrase and an app-key encryption passphrase of at least 12 characters.
3. Review the derived address, FID, Ed25519 public key, permissions, and 30-day inactivity expiry.
4. Choose **Register app key (gasless)**. The browser submits a custody-authorized `KEY_ADD` message to the configured write node. Signer registration requires no ETH or Optimism transaction.
5. Wait for the key to appear in the read node's unified signer list, then publish.

The account must already exist and have active storage; gasless signer registration does not create an FID or buy storage. This key can publish/delete casts, add/remove likes and recasts, and follow/unfollow accounts. It cannot create other keys or change custody. Its 30-day sliding expiry refreshes when it signs merged messages. The node must support gasless signers and report its current user nonce and capacity through `signersByFid`.

The phrase and custody key stay in browser memory. Public custody lookup calls go to the configured Optimism RPC; the node receives signed Farcaster authorization, never the phrase or custody private key. Only the Ed25519 app key is persisted, encrypted with AES-256-GCM and PBKDF2-SHA256 (310,000 iterations). The registration type is authenticated with the other account metadata. The encryption passphrase is not persisted.

If a write reports **Origin mismatch**, check that `FREECAST_PUBLIC_URL` matches the exact browser origin (scheme, host, and port), then restart the server. For local-only development you can leave it unset. Verified same-origin loopback writes also work when a hosted public URL remains configured.

The encrypted key is saved **before** submission. If confirmation is interrupted, select **Unlock saved app key** after the read node catches up; unlocking checks that the gasless key is still active, unexpired, and has the required scopes. **Lock** ends the active session; **Forget** deletes the local encrypted copy. Neither operation revokes authorization. Gasless revocation uses a `KEY_REMOVE` message, not the Optimism Key Registry; see the [official signer documentation](https://snapchain.farcaster.xyz/guides/writing-messages).

No analytics are added. The optional QR approval flow uses Farcaster's signed-key-request API. Images and videos load from their original hosts; YouTube and Vimeo players load only after Play. Google Fonts are loaded for the visual design. Self-host fonts for a fully disconnected asset path.

## Reading and writing

- Profile feeds are chronological, paginated, and keyed by numeric FID. Following feeds load up to 15 current casts per author in batches of 12; this is intentionally a bounded feed rather than an exhaustive network index.
- A short hash like `0x50184b62` is resolved by paging FID 37's casts and then calling `castById` with `0x50184b62b4c52fd76628713562e1eda3dccaf63d`.
- Casts, replies, likes, recasts, follows, and unfollows are signed with the Ed25519 app key. `dataBytes` is explicitly encoded for Snapchain compatibility.
- Cast publishing polls the read node for inclusion after validator acceptance. If the poll expires, the error gives the hash; look it up before retrying. Follow and reaction actions report acceptance only.
- `VALIDATOR_URL` must point at an actual validator's HTTP API that permits unauthenticated submission. No working default validator is asserted. A docs website, a gRPC URL, or an arbitrary read hub is not an interchangeable substitute.
- Current read nodes can validate and relay writes over gossip. This client sends writes directly to the separately configured validator to follow the contest brief.

## Filtering by client

Feed controls can include or exclude requesting client FIDs and exact Ed25519 public keys. Onchain key registration metadata includes a requester FID. The client reads active signer events for each loaded author and maps signer keys to those requesters. Unknown keys are dropped by include filters and retained by exclude filters.

Limitations: gasless-key attribution is not yet resolved; active signer queries cannot attribute old revoked keys; some clients register using the user's own FID, and a requester FID alone is not an independently verified application identity. Exact-key filtering still works. A production indexer could retain historical registry events and resolve gasless signer metadata.

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
2. Configure and test a real validator submission endpoint.
3. Use an actual funded custody account with storage to register the app key, post, reply, follow/unfollow, and react.
4. Have an independent human follow the tutorial from a clean machine. Use `docs/human-test.md` and fix problems they report.
5. Publish the MIT-licensed repository on GitHub and the tutorial with public access.
6. Have the tester post an honest public endorsement. Submit the three URLs as a reply to the original cast by **24 October 2026 at 14:47:30 UTC**.

## Primary references

- [Snapchain source and hardware requirements](https://github.com/farcasterxyz/snapchain)
- [Official getting started guide](https://snapchain.farcaster.xyz/getting-started)
- [Read nodes vs. validators](https://snapchain.farcaster.xyz/node-types)
- [HTTP API](https://snapchain.farcaster.xyz/reference/httpapi/httpapi)
- [Farcaster core SDK](https://github.com/farcasterxyz/hub-monorepo/tree/main/packages/core)
- [Farcaster contracts](https://github.com/farcasterxyz/contracts)
- [Original contest cast](https://farcaster.xyz/balajis.eth/0x50184b62)

## Cast composer limits

Casts, replies and quotes support up to 1,024 UTF-8 bytes and two total embeds for regular accounts, or 10,000 UTF-8 bytes and four embeds for active Pro accounts. Images, GIFs, links and the quoted cast share those embed slots. The composer shows a byte counter based on the published text (selected mention labels do not consume text bytes), disables publishing above the current limits and keeps the full draft for editing. Pro status is read from `storageLimitsByFid`; the UI updates when the subscription expires. Publishing rechecks Pro for extended text or more than two embeds, and the approved-account server independently verifies it before signing. Unavailable Pro status blocks only those extended posts; ordinary casts remain available. No draft text is truncated.

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

After a restart, Freecast restores the same browser-bound signer and checks its onchain registration and storage before allowing it to be used. Connections expire after 30 days; pending requests expire after ten minutes. Signing out deletes the saved signer for that browser. No message is submitted when a connection is restored. Missing or unreadable encryption data fails closed instead of silently replacing a saved key.

Client attribution reads `requestFid` for gasless keys from `signersByFid` and retains onchain signer metadata for existing clients and older nodes. Custody-phrase registration currently uses the account itself as requester, so its label resolves to that account's username rather than a separate Freecast app identity. Attribution caches expire so new keys can become visible.

Notifications are available at `/notifications` for the connected account. Mentions and current follow events are paginated directly from the node. Replies, likes and recasts are checked on the latest ten authored casts first; **Load more activity** checks older casts and continues activity pages. The view deduplicates mentions that are also replies, excludes your own actions, and shows retry controls for partial failures. It is a read-on-demand view with manual refresh, not push notifications or a complete historical archive.

### Image uploads

Set `IMGBB_API_KEY` in the ignored server `.env` and restart Freecast. The API key stays on the server; do not prefix it with `VITE_` or `NEXT_PUBLIC_`. Both the development and production server expose the same image upload route.

Use **Add image** in the composer, reply or quote dialog. JPEG, PNG, GIF and WebP files up to 10 MB are supported, with previews and removal before publishing. Casts and replies support two images, or four for active Pro accounts; quotes reserve one of those slots for the quoted cast. Image-only casts and replies are supported. Publishing waits until the upload finishes, and failed uploads preserve the draft. Images upload immediately to ImgBB without an expiration setting; removing an attachment from the draft or deleting a cast does not delete the hosted image. The upload endpoint enforces the app origin and limits each connecting IP to 20 attempts per hour (in-memory per server process).

### GIF picker

Use **GIF** beside **Add image** to browse featured GIFs, search, or load more results. Selected GIFs attach directly from Tenor and share the account's embed slots (two normally, four for Pro, with one reserved for a quoted cast); they do not upload to ImgBB. The same picker is available in casts, replies and quotes. Freecast uses the `tenor.bhopp.ing` provider from the [GIF miniapp](https://github.com/sah-ban/gif) through its server-side `/api/gifs` route, with a short bounded cache, validated media URLs, and retryable errors. No additional API key is required; availability depends on that third-party provider.

HTTP and HTTPS links typed or pasted into the cast, reply, quote, or edit composer automatically become embeds while remaining in the text. Use **Attach link** to embed a URL without putting it in the text. Remove a preview to keep that URL as text only for the rest of the draft; explicitly attaching the same URL restores its preview. Duplicate URLs are skipped, and removing an automatic URL from the text removes its preview. Previews load after a short typing pause and may fall back to a plain link when metadata is unavailable. Links share slots with images, GIFs, and quoted casts: two total normally, or four with an active Pro subscription, including the quoted cast itself. When slots are full, additional text links remain ordinary text. Both local signing and approved-account signing validate the same HTTP/HTTPS URL and 256-byte limit.


### Edit profile

Open **My profile → Edit profile** to update your display name, bio, profile picture, banner, or website. Pictures and banners accept image URLs or uploads through the configured ImgBB integration. Fname changes have a separate localhost-only flow described below.

Updates use signed `USER_DATA_ADD` messages for the connected FID, and the client waits for each field to appear on the read node before reporting success. Multi-field edits are separate messages; an interrupted save can partially succeed and the editor reports how many fields were confirmed. Profile caches refresh after edits. Display names allow 32 UTF-8 bytes; the other editable values allow 256.

Existing gasless keys without `MESSAGE_TYPE_USER_DATA_ADD` (scope 11) retain their current posting access but cannot edit profiles. New gasless registrations include scope 11 and show profile editing in the permission review. Approved onchain signers support profile edits.

Banner editing requires an active Farcaster Pro subscription. The editor checks `storageLimitsByFid` before enabling banner upload, URL changes, or removal, and rechecks before submitting any save that changes the banner. If Pro status cannot be verified, banner editing stays disabled with a retry option; other profile fields remain available. Existing banners remain visible after a subscription expires.

### Change fname on localhost

Open Freecast at `localhost`, `127.0.0.1` or `[::1]`, connect your account, then choose **Edit profile → Change username**. Enter the new fname, custody recovery phrase and derivation index. The phrase stays in browser memory and is cleared from the field before review; it is never stored or sent to Freecast, the registry or the RPC. Only signed public username proofs go directly to `fnames.farcaster.xyz`. The phrase must derive the connected FID's current custody address, and the connected app signer must allow profile updates. ENS names use a separate registration process.

Availability, known reserved names, and the registry's [28-day cooldown](https://github.com/farcasterxyz/fname-registry/blob/main/src/transfers.ts) are checked before review and again before submission. The new name's complete transfer history is checked too: a released name can still be cooling down. Review the current and new fnames and custody address, then explicitly confirm the release. Releasing the old name and claiming the new one are separate registry writes; the new name is not reserved by an availability check, and the old name may not be reclaimable for 28 days. Both custody proofs are prepared before releasing anything, with the claim timestamp later than the release.

After claiming, Freecast waits for the fname proof on the read node, submits the preferred username (`USER_DATA_ADD`, type 6), and waits for inclusion. A failed release never proceeds to claiming. A failed or ambiguous submission can be retried on the open page: registry ownership is checked first, so confirmed releases or claims are not repeated. If a name is already claimed by this FID, the flow can finish only the preferred-name update. Closing the form discards its in-memory custody key and does not reverse completed transfers; after reopening, enter the same claimed fname to finish a pending profile update. Tests use public fixture keys and mocked transfers only.

The preferred-fname action is restricted to loopback hosts and loopback peers on the server, and independently verifies that the node's proof belongs to the approved FID. Existing hosted approval configuration can remain in `.env` while connecting locally; local and hosted sessions remain bound to their own origins.

Active Farcaster Pro subscriptions display a **PRO** badge beside names in profiles, casts, quotes, notifications, and user lists. Hover or focus the badge to access its expiry description, such as “Expires in 2 months 5 days.” Remaining time uses calendar months and UTC days. Badge lookups share a bounded five-minute cache per node and FID, with at most four concurrent requests. Expired, non-Pro, or unavailable subscriptions do not display a badge; banner editing continues to perform its own fresh subscription checks.

Profiles show the full joined date from the earliest recorded incoming fname transfer to that FID, read through the fixed `fnames.farcaster.xyz/transfers` provider. This fname acquisition date may differ from FID registration. Outgoing transfers and invalid or future timestamps are ignored. History is paginated and cached for five minutes; empty or unavailable histories omit the joined date. ENS-only accounts may have no fname history.

Open **Settings** in the sidebar or visit `/settings` to choose System, Light, or Dark appearance; connect, manage, or lock/sign out of an account; edit your profile; open feed controls; and inspect or refresh connection status. Theme preferences persist on the device and stay synchronized with the header toggle. System appearance follows the device setting. Connection credentials remain server-configured.

### Edit a cast by replacing it

For your own casts, choose **Edit cast** in the three-dot menu. The edit composer restores text and mentions, all URL and quoted-cast embeds, and reply or channel context. It shows the previous cast's likes, recasts, and replies (paginated counts use `+`). URL embeds can be edited or removed; images, GIFs, and links can be added within the account's embed limit.

For your own casts, choose **Post to Twitter** in the three-dot menu while connected as the cast author to open a tweet intent with the full cast text and embedded URLs appended at the end. Structured mentions use each account's linked X username from Snapchain's `USER_DATA_TYPE_TWITTER` (type 8), read through the existing `userDataByFid` profile lookup. The action waits for mentioned accounts to resolve; missing, invalid or unavailable X usernames become Farcaster profile links rather than guessing a Twitter handle. The original cast text and its Farcaster mentions stay unchanged. URLs already present in the text are not appended twice, and quoted casts become Farcaster links. This opens a draft for review; upload images and videos manually on Twitter. No Twitter account connection or automatic publishing is involved. The public `v2/user` API remains used only for follower and following totals.

Profile follower and following totals come from `https://api.farcaster.xyz/v2/user?fid=…` through `/api/profile/counts`, with a one-minute server cache. If that provider is unavailable, the profile falls back to the node's loaded connection counts (`+` when more pages exist). Clicking either count still opens the node-backed followers or following list, which may differ while the services catch up.

The conversation's Likes and Recasts lists show **via @clientusername** for each reaction using that reaction's signer requester. Client links open the requester's profile in Freecast; unresolved or missing signers show **Unknown client**. Attribution loads as rows approach the viewport and uses the existing signer cache. The key requester may differ from the app brand.

Profiles show **Connected clients** from the node's unified `signersByFid` endpoint, covering both onchain and gasless keys. Keys are grouped by their requester FID so one client appears once, and expired keys are excluded. Client names and avatars link to their Freecast profiles. Active keys with missing requester attribution appear together as **Unknown client**. The list reads all signer pages before displaying results; failures show a retry action. Refreshing the profile reloads connections. This identifies signer requesters, which may differ from app brands, and does not revoke or modify any key.

**Delete previous and cast again** prepares and validates the signed replacement first, confirms deletion of the previous cast, then publishes and confirms the new cast. Pro requirements are checked before deletion. This is a new cast with a new hash: engagement does not transfer. If deletion fails, no replacement is submitted. If publication fails, the draft and signed replacement remain available on this open page; **Close and keep draft → Resume cast edit** reopens it. Retries reuse the same signed message and check for inclusion before resubmitting to avoid duplicate replacements. Refreshing or closing the browser page discards this in-memory recovery state. Tests use mocked writes and never delete or publish real casts.
