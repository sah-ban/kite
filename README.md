# Freecast

A local Farcaster client and a responsive tutorial for running your own Snapchain read node. MIT licensed.

The tutorial lives at `/`; the client lives at `/client`. The client reads directly from a configured node through a small local gateway. It signs protocol messages in the browser and submits them to a separately configured validator.

## Try it on this machine

This development machine has about 8 GB RAM and 20 GB free disk: enough for the client, far below the read node's capacity requirements. No node has been provisioned here.

```bash
cd /root/projects/freecast
./freecast client
```

Open http://127.0.0.1:5173 for the guide or http://127.0.0.1:5173/client for the client. The first run creates `.env` pointing at a node on localhost. This development machine needs an existing remote node: configure `NEXT_PUBLIC_HUBURL` in your local `.env` before starting. Existing `.env` files are never overwritten. Endpoint URLs belong in local configuration, not in source control. `VALIDATOR_URL` is empty by default: configure a real validator HTTP endpoint to enable posting. No seed phrase is needed for reads.

## Three-command quickstart on suitable existing compute

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

An existing FID must have active storage. The imported phrase must derive its current custody address; a verified wallet or recovery address may be different. Default derivation is `m/44'/60'/0'/0/0`, with an adjustable final address index.

1. Choose **Connect account** on localhost.
2. Enter the custody seed phrase and an app-key encryption passphrase of at least 12 characters.
3. Review the derived address, FID, Ed25519 public key, and estimated execution gas.
4. Choose **Register app key** to sign and broadcast one `KeyGateway.add` transaction on Optimism. The custody wallet needs ETH for gas. The displayed execution estimate does not include all L1 data fees.
5. Wait for confirmation and for the validator to observe the signer, then publish.

The phrase and custody key stay in browser memory. Public contract calls and the signed Ethereum transaction go to the configured Optimism RPC. Only the Ed25519 app key is persisted, encrypted with AES-256-GCM, PBKDF2-SHA256 (310,000 iterations), a random salt, and a random IV. Account metadata is authenticated as additional data. The encryption passphrase is not persisted.

The encrypted key is saved **before** broadcasting registration so an interrupted confirmation does not lose it. If the transaction failed, unlocking reports the unregistered key; register a replacement after checking the transaction. **Lock** ends the active session; **Forget** deletes the local encrypted copy. Neither operation revokes the onchain key. Revoke through the Key Registry from your custody wallet. Onchain app keys are not scoped like current gasless signers: they authorize broad Farcaster message signing until revoked.

No analytics, remote scripts, or third-party account services are used. Google Fonts are loaded for the visual design. Self-host fonts for a fully disconnected asset path.

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

`@farcaster/core` is pinned to 0.15.3, the release recommended by npm audit that avoids the vulnerable fixture dependency in later releases. The client uses its stable onchain signer and message APIs with explicit Snapchain `dataBytes` encoding. This version publishes casts up to 1,024 UTF-8 bytes and reads longer casts returned as JSON. The tutorial and client are separate chunks. Gasless signers and 10K-cast publishing require a newer SDK integration.

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
