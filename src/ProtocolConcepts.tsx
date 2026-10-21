export function ProtocolConcepts() {
  return <section id="concepts">
    <h2>The protocol, without the fog.</h2>
    <p>Farcaster separates your identity, the messages you sign, and the clients you use to read them. Understanding those boundaries helps you keep control of your account.</p>

    <h3>Identity and usernames</h3>
    <dl className="glossary">
      <dt>FID</dt>
      <dd>Your permanent numeric account identifier. You can change your username, profile, or custody address while keeping the same FID, casts, and followers.</dd>

      <dt>Fnames, ENS names, and Basenames</dt>
      <dd>Common username forms are an fname such as <code>alice</code>, an ENS name such as <code>alice.eth</code>, or a Basename such as <code>alice.base.eth</code>. Basenames are ENS subnames under <code>base.eth</code>. For ENS names and Basenames, the name must resolve to your custody address or a wallet verified to your FID; a username proof and preferred-username update are also needed. Merely holding a name does not automatically change your profile. Fnames are free, issued offchain, and subject to a 28-day change cooldown. ENS names and Basenames follow their own registration and renewal rules. <a href="https://docs.farcaster.xyz/learn/architecture/ens-names" target="_blank" rel="noreferrer">Fname rules</a> · <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/src/mempool/l1_validator.rs" target="_blank" rel="noreferrer">ENS and Basename verification</a>.</dd>

      <dt>Custody wallet and recovery phrase</dt>
      <dd>The custody address is the Ethereum address that owns your FID in the Id Registry on Optimism. A recovery phrase can derive the private key controlling that wallet. A verified wallet may be the same address or a different one; the recovery address is a separate account-recovery mechanism. The Farcaster client, formerly Warpcast, also includes a wallet. Sharing a phrase exposes any wallet keys derived from it, so it can put both your identity and funds at risk. Keep your custody wallet separate from your everyday funds, and prefer delegated app authorization. <a href="https://docs.farcaster.xyz/learn/what-is-farcaster/accounts" target="_blank" rel="noreferrer">Account ownership and recovery</a>.</dd>
    </dl>

    <h3>Keys, messages, and nodes</h3>
    <dl className="glossary">
      <dt>App keys and connected clients</dt>
      <dd>Connecting a client authorizes an Ed25519 key pair to act for your FID. The private key signs permitted actions, such as casts, reactions, follows, or profile edits; by itself it cannot move wallet funds or transfer custody. The public key appears as the message’s signer and verifies its signature. Snapchain exposes registered keys and their requester FIDs, which clients use for attribution and connected-client lists. A requester FID does not guarantee an app’s brand or trustworthiness. Approve clients you trust and review their permissions. <a href="https://snapchain.farcaster.xyz/guides/writing-messages#gasless-signers" target="_blank" rel="noreferrer">Signer permissions</a>.</dd>

      <dt>Revoking access</dt>
      <dd>Revoking a key stops it authorizing new messages. Current Snapchain retains messages already accepted from that key, so revocation does not erase a client’s old casts. Gasless keys can also expire after inactivity. Signing out or forgetting a saved key only removes that saved connection; it does not revoke the key on the protocol. <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/src/storage/store/engine.rs" target="_blank" rel="noreferrer">Current revocation behavior</a>.</dd>

      <dt>Snapchain messages and cast hashes</dt>
      <dd>A signed protobuf message records an action such as a cast, reaction, follow, or profile update. Remove messages change the current state. A full cast hash is a 20-byte identifier: 40 hexadecimal digits after <code>0x</code>. Short hashes in shared URLs must be resolved before requesting the cast by ID.</dd>

      <dt>Read nodes and validators</dt>
      <dd>Anyone can run a read node to sync the network and serve its public data without a provider API key. A read node also accepts signed submissions and relays them to validators. Validators propose and vote on blocks; joining the validator set is a separate process. Kite uses the same configured node for reads and submissions.</dd>
    </dl>

    <h3>Data, storage, and client rules</h3>
    <dl className="glossary">
      <dt>Profile data</dt>
      <dd>Snapchain provides fields including preferred username, display name, profile picture, bio, website, location, banner, X/GitHub usernames, and primary wallet addresses. X/GitHub fields are self-reported profile data, rather than proof that an account owns those social profiles. Images are generally stored as URLs; the image files live with their hosts. <a href="https://snapchain.farcaster.xyz/reference/httpapi/userdata" target="_blank" rel="noreferrer">Profile fields</a>.</dd>

      <dt>Farcaster Pro</dt>
      <dd>Active Pro is required to set a profile banner and publish longer casts of up to 10,000 UTF-8 bytes. Bytes and characters are not always the same length. An accepted banner can remain in Snapchain after Pro expires, so a banner does not prove an active subscription. Current protocol versions permit up to four embeds for all accounts; older versions restricted non-Pro accounts to two. A client may offer a lower limit. <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/src/core/validations/message.rs" target="_blank" rel="noreferrer">Banner validation</a> · <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/src/core/validations/cast.rs" target="_blank" rel="noreferrer">Cast and embed limits</a>.</dd>

      <dt>Storage rent and pruning</dt>
      <dd>Storage rent provides message capacity, with separate limits for casts, reactions, links, and other records. When retained messages exceed a limit, older records can be pruned; expiring storage can reduce your capacity too. Unfollowing or deleting creates a remove record, which can still count until it is compacted or pruned. Following 100 accounts and then unfollowing them therefore does not necessarily free 100 storage slots immediately. Snapchain’s retained state is not a permanent archive. <a href="https://snapchain.farcaster.xyz/reference/httpapi/storagelimits" target="_blank" rel="noreferrer">Storage usage API</a> · <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/src/storage/store/account/link_store.rs" target="_blank" rel="noreferrer">Link storage and compaction</a>.</dd>

      <dt>Social graph and follower counts</dt>
      <dd>Follow relationships are public protocol data that other apps can use. Snapchain’s link endpoints return paginated relationships rather than a ready-made total for each profile. A client can count all pages or maintain a backend index for fast follower/following totals. Counts reflect the state retained by that node and how far it has synced. <a href="https://snapchain.farcaster.xyz/reference/httpapi/links" target="_blank" rel="noreferrer">Follow relationships API</a>.</dd>

      <dt>Channels</dt>
      <dd>Channels group public conversations around topics, much like communities. Channel casts carry a channel reference, commonly a parent URL. Discovery, membership, moderation, and how channel posts enter a feed can vary between clients.</dd>

      <dt>Blocks and mutes</dt>
      <dd>Clients decide how to hide content and restrict interactions in their interfaces. Snapchain supports public block records, but a block is not a network-wide ban: another client may apply different rules and still display someone’s public casts or interactions. Mute and moderation settings should not be assumed to transfer automatically between apps. <a href="https://github.com/farcasterxyz/snapchain/blob/v0.14.3/CHANGELOG.md" target="_blank" rel="noreferrer">Protocol block support</a>.</dd>
    </dl>
    <p>You can build a client or another application using Farcaster’s public social graph without asking an existing client’s permission. Each app chooses its own feeds and interface while using the same identities and signed protocol data.</p>
  </section>;
}
