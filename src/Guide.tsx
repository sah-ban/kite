import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Github, Terminal, Server, Radio } from 'lucide-react';
import { KiteMark } from './KiteMark';
import { Code } from './components';
import { ProtocolConcepts } from './ProtocolConcepts';

function ExpectedResult({children,compact=false}:{children:ReactNode;compact?:boolean}) {
  return <div className={`guide-result${compact?' compact':''}`}>
    <CheckCircle2 size={18} aria-hidden="true"/>
    <div><strong>Expected result</strong><p>{children}</p></div>
  </div>;
}

function TechnicalDetails({title,children}:{title:string;children:ReactNode}) {
  return <details className="guide-technical"><summary>Technical details: {title}</summary><div>{children}</div></details>;
}

export function Guide({openClient}:{openClient:()=>void}) {
  return <main className="guide">
    <section className="guide-hero">
      <div className="eyebrow"><span className="live-dot"/> A PRACTICAL GUIDE TO FARCASTER</div>
      <h1>Your node.<br/>Your feed.<span className="hero-asterisk">✳</span><br/><em>Your rules.</em></h1>
      <p>Run the network on your own terms. Set up a Snapchain read node and a working Farcaster client, one step at a time.</p>
      <div className="hero-actions">
        <a className="button primary" href="#quickstart">Start building <ArrowRight size={17}/></a>
        <button className="button" onClick={openClient}>Try the client <Radio size={16}/></button>
        <a className="button" href="https://github.com/sah-ban/kite" target="_blank" rel="noopener noreferrer"><Github size={17}/>GitHub</a>
      </div>
      <div className="hero-footnote">Open source · MIT licensed · No read-provider API keys</div>
      <div className="network-visual" aria-label="Your client reads and submits signed messages through the same node">
        <div className="visual-label">THE PATH TO YOUR OWN FEED</div>
        <div className="visual-node client-node"><Radio/><strong>Your client</strong><span>Sign with your app key</span></div>
        <div className="visual-line"><span>READ ↓</span><span>SUBMIT ↓</span></div>
        <div className="visual-bottom single-node"><div className="visual-node"><Server/><strong>Your Snapchain node</strong><span>Read data + submit signed messages</span></div></div>
        <div className="visual-caption"><span className="live-dot"/> One protocol. Independent clients.</div>
      </div>
    </section>

    <section className="quickstart" id="quickstart">
      <div className="section-heading">
        <div><span className="eyebrow">01 / QUICKSTART</span><h2>Three commands.<br/>A little more independence.</h2></div>
        <p>Start with a clone of this repository on a Linux machine. Each command checks its prerequisites and explains what happens next.</p>
      </div>
      <div className="prerequisites"><strong>Before you start</strong><span>Client: Node.js 22.13+ and npm · Node host: Git, curl, Python 3 · Ubuntu 22.04/24.04 node host · 4 cores · 16 GB RAM · 2 TB free SSD · public IP</span></div>
      <Code label="ON EACH MACHINE YOU USE">{'git clone https://github.com/sah-ban/kite.git\ncd kite'}</Code>
      <div className="steps">
        <article>
          <div className="step-number">00</div><Terminal size={24}/><h3>Prepare the compute</h3>
          <p>Check a machine you own and install Docker. Stops if the host is too small.</p>
          <Code label="ON YOUR NODE HOST">{'./kite provision --existing'}</Code>
          <ExpectedResult compact>Resource checks pass. Docker is ready, or you are asked to reconnect before continuing.</ExpectedResult>
        </article>
        <article>
          <div className="step-number">01</div><Server size={24}/><h3>Start your read node</h3>
          <p>Fetch the official configuration, start Snapchain, and watch the network sync.</p>
          <Code label="ON YOUR NODE HOST">{'./kite node'}</Code>
          <ExpectedResult compact>The node starts. Snapshot download and initial sync can take hours; check progress with <code>./kite status</code>.</ExpectedResult>
        </article>
        <article>
          <div className="step-number">02</div><Radio size={24}/><h3>Make it your feed</h3>
          <p>Start the client. Approve a fresh signer in Farcaster or import a registered key locally.</p>
          <Code label="ON YOUR CLIENT MACHINE">{'./kite client'}</Code>
          <ExpectedResult compact>The terminal shows a local URL. Open <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a> and keep the terminal running.</ExpectedResult>
        </article>
      </div>
      <div className="note">Trying this on a laptop or a small machine? Set <code>HUBURL</code> to an existing read node in your local <code>.env</code>, then run <code>./kite client</code>.</div>
    </section>

    <div className="tutorial-layout">
      <aside className="toc">
        <span className="eyebrow">THE FIELD GUIDE</span>
        {[['compute','Choose your compute'],['sync','Sync the network'],['connect','Connect your client'],['identity','Bring your account'],['write','Post, follow, react'],['filter','Filter by client'],['concepts','Protocol concepts'],['troubleshoot','When things go wrong']].map(([id,label],i)=><a key={id} href={`#${id}`}><span>{String(i+1).padStart(2,'0')}</span>{label}</a>)}
      </aside>
      <div className="tutorial-content">
        <section id="compute">
          <span className="eyebrow">02 / THE WALKTHROUGH</span><h2>Choose your compute.</h2>
          <p>A read node stores the network, so disk capacity is the first constraint. Use a dedicated Linux server with at least 16 GB RAM, four CPU cores, 2 TB of free SSD space, and a public IP.</p>
          <p>The provision command checks these limits before making changes. With <code>--existing</code>, it prepares an Ubuntu host you already own. If Docker is missing, it installs Docker Engine and Compose v2 from Docker’s official Ubuntu repository.</p>
          <Code label="ON YOUR NODE HOST">{'./kite doctor\n./kite provision --existing'}</Code>
          <ExpectedResult>You see <code>PASS</code> for CPU cores, RAM, and free disk. Provisioning then reports that Docker is ready, or asks you to sign out and reconnect so Docker group access takes effect. Complete that step before starting the node.</ExpectedResult>
          <p>Use an account with sudo access. Allow inbound UDP 3382 for gossip and outbound access to peers and snapshot storage. Check your provider firewall as well as the host firewall.</p>
          <p>Keep HTTP 3381 bound to loopback; use an SSH tunnel if your browser runs elsewhere. Do not expose the client’s account-import interface to the internet.</p>
          <p>An existing server avoids a new cloud account. Rented compute costs money for as long as it runs; the provision command never creates a paid server implicitly.</p>
          <TechnicalDetails title="optional AWS provisioning">
            <p>The Terraform configuration in <code>infra/aws</code> provisions a VM, a 2 TB disk, and a firewall. Review its plan and your provider’s actual price before applying. The repository’s README explains this alternative.</p>
          </TechnicalDetails>
        </section>

        <section id="sync">
          <h2>Sync the network.</h2>
          <p>The node command downloads the canonical mainnet configuration and starts a read node with persistent data directories. Its HTTP and gRPC APIs stay bound to localhost.</p>
          <Code label="ON YOUR NODE HOST">{'./kite node\n./kite status'}</Code>
          <ExpectedResult>Once the node’s API is available, <code>./kite status</code> lists each shard’s height and delay. While syncing, it prints <code>Still catching up.</code> Wait for <code>Low shard delay.</code>, then check again later to confirm that heights keep advancing.</ExpectedResult>
          <p>The initial snapshot is several hundred gigabytes. Downloading and decompressing it can take a few hours, followed by block catch-up. Slower disks or networks can take longer.</p>
          <p>A listening HTTP port alone does not mean sync is complete. Every shard’s height should advance and its delay should approach zero.</p>
          <TechnicalDetails title="node status and logs">
            <p>The status command reports <code>maxHeight</code> and <code>blockDelay</code> for each shard. It exits with code 2 while catching up and code 1 when the node is unavailable.</p>
            <Code label="ON YOUR NODE HOST">{'curl http://127.0.0.1:3381/v1/info\ndocker compose -f .kite/node/docker-compose.yml logs --tail 80 snapchain'}</Code>
            <p>A read node may report <code>mempoolSize: 4294967295</code>. That sentinel means it has no local mempool, not that billions of writes are waiting.</p>
          </TechnicalDetails>
          <p>Stopping Compose preserves the stored network state. Never delete the RocksDB directories to fix a routine restart.</p>
          <TechnicalDetails title="updating Snapchain">
            <p>The configuration and snapshot come from the same Snapchain release. To update, choose a tested release with <code>SNAPCHAIN_REF</code> and rerun the node command after reviewing its release notes.</p>
          </TechnicalDetails>
        </section>

        <section id="connect">
          <h2>Connect your client.</h2>
          <p>Set <code>HUBURL</code> in your local <code>.env</code> to the Snapchain HTTP API. Kite uses this node for both reads and signed submissions.</p>
          <Code label="ON YOUR CLIENT MACHINE">{'test -f .env || cp .env.example .env\n# Edit .env:\nHUBURL=http://127.0.0.1:3381\nOPTIMISM_RPC_URL=https://mainnet.optimism.io\n\n./kite client'}</Code>
          <ExpectedResult>The terminal shows Vite’s local web address. Open <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a> in the browser on your client machine. Kite should open; keep the terminal running while you use it.</ExpectedResult>
          <p>If the node runs on another machine, open a second terminal on your client machine and keep this tunnel running:</p>
          <Code label="ON YOUR CLIENT MACHINE">{'ssh -N -L 3381:127.0.0.1:3381 ubuntu@YOUR-NODE-IP'}</Code>
          <p>The tunnel makes the node available at the localhost URL used above. Use the login name and IP address for your own node host.</p>
          <h3>What appears in Home?</h3>
          <p>With the optional PostgreSQL feed service running, signed-out Home shows recent public posts. Connect an account to view its Following feed.</p>
          <p>Without that service, the public feed is unavailable. Connected accounts can still read a bounded Following feed directly from the node.</p>
          <p>For a continuously indexed timeline and live notifications, configure PostgreSQL and run the feed worker using the <a href="https://github.com/sah-ban/kite#indexed-following-feed" target="_blank" rel="noreferrer">Indexed Following feed instructions</a>. Running Snapchain alone does not start this separate service.</p>
          <p>Profiles have separate Posts, Replies, and Likes tabs. Posts include channel casts; Replies show casts with a parent cast.</p>
          <TechnicalDetails title="the local gateway">
            <p>The React client uses a small local HTTP gateway to avoid browser CORS and mixed-content issues. The upstream node URL stays in the server’s local configuration.</p>
            <p>Local account imports sign in the browser. QR approval sessions store their delegated signing key encrypted on the server.</p>
          </TechnicalDetails>
        </section>

        <section id="identity">
          <h2>Bring your account.</h2>
          <h3>Approve a fresh signer in Farcaster</h3>
          <p>The operator configures a server-only developer app FID and mnemonic in the ignored <code>.env</code>, using <code>FARCASTER_APP_FID</code> and <code>FARCASTER_APP_MNEMONIC</code>.</p>
          <p>Open Kite on localhost or HTTPS. Choose <strong>Approve a fresh signer in Farcaster</strong>, then <strong>Create signer and show QR</strong>. Scan or open the link and approve in Farcaster. You do not enter your custody phrase into Kite.</p>
          <p>The delegated private key is stored encrypted on the server. Connections last up to 30 days and survive restarts. Signing out removes the saved connection; revoke the app key in Farcaster to remove protocol authorization.</p>
          <h3>Import an existing signer on localhost</h3>
          <p>Choose <strong>Import existing signer</strong>. Enter your FID and registered 32-byte Ed25519 private key, then choose an encryption passphrase. This needs no custody phrase or new Optimism transaction.</p>
          <p>The client checks onchain registration and active storage before saving an encrypted local copy. Gasless-only signer imports are not supported yet.</p>
          <h3>Register a new key with a custody phrase</h3>
          <p>This localhost-only flow needs an existing Farcaster account with active storage. Your phrase must derive the account’s custody address. A connected wallet or recovery address is not necessarily that address.</p>
          <ol>
            <li>Open Kite at <code>http://127.0.0.1:5173</code> and choose <strong>Connect account</strong>.</li>
            <li>Choose <strong>Register a new key with a custody phrase</strong>. Enter the custody phrase and choose an encryption passphrase of at least 12 characters.</li>
            <li>Review the derived custody address, FID, public key, permissions, and inactivity expiry.</li>
            <li>Choose <strong>Register app key (gasless)</strong>. No Optimism transaction or ETH is required to register this signer.</li>
          </ol>
          <ExpectedResult>Your connected account’s username appears and the composer becomes available. Approval, import, or registration alone does not publish a cast. Registration finishes when Snapchain accepts the signed message.</ExpectedResult>
          <p>Use a test account when trying custody-phrase setup, and prefer delegated Farcaster approval when available. The phrase stays in browser memory during registration; it is never saved or sent to the server.</p>
          <h3>Reconnect and remember this device</h3>
          <p>Local app keys are saved encrypted. Reloading normally requires your encryption passphrase. Select <strong>Remember this device</strong> to reconnect automatically for 30 days in the same browser and origin.</p>
          <p>Only enable this on a trusted device: anyone using that browser can act as your account. Your passphrase is never saved.</p>
          <p><strong>Lock account</strong> removes remembered access across open tabs. <strong>Forget local app key</strong> also deletes the encrypted copy. Neither action revokes the key on the protocol.</p>
          <TechnicalDetails title="key validation, encryption, and permissions">
            <p>The approval server checks the FID, onchain signer registration, and active storage before enabling account actions. QR approval uses Farcaster’s approval service and currently supports onchain signers.</p>
            <p>Custody-phrase setup uses derivation <code>m/44'/60'/0'/0/0</code> by default. A custom address index is available under <strong>Advanced options</strong>. The phrase input is cleared after preparation.</p>
            <p>The browser sends public custody lookups and a signed <code>KEY_ADD</code> authorization, never the custody phrase or private key. It encrypts the local app key with AES-GCM and a PBKDF2-derived key.</p>
            <p>Remembered access uses a non-extractable browser unlock key. Authorization and storage are rechecked before restoring access. If registration is interrupted, the encrypted app key remains saved for unlocking.</p>
            <p>The gasless key permits casts, deletions, likes, recasts, follows, profile edits, and their supported removals. It cannot authorize other keys. It expires after 30 days of inactivity; merged messages refresh that window. Revocation uses a <code>KEY_REMOVE</code> message.</p>
          </TechnicalDetails>
        </section>

        <section id="write">
          <h2>Post, follow, react.</h2>
          <p>Enter text in the composer and choose <strong>Publish cast</strong>. Kite signs your message with your app key and submits it to the configured node.</p>
          <ExpectedResult>You see <strong>Cast published</strong> and a <strong>View cast</strong> link. If submission fails, the draft stays available for editing or retrying.</ExpectedResult>
          <p>Use the actions below a cast to reply, like, or recast. Open a profile by FID to follow or unfollow it.</p>
          <p>These actions are signed protocol messages, not Optimism transactions. Kite reports success when Snapchain accepts the message; refresh after the node catches up to inspect the updated state.</p>
          <TechnicalDetails title="how signed messages are submitted">
            <p>Kite builds a Farcaster message, signs its hash with your Ed25519 app key, encodes the protobuf bytes, and submits them to Snapchain.</p>
            <p>Snapchain requires <code>dataBytes</code>, so the serializer includes the encoded message data explicitly. Kite does not query again to confirm inclusion after an accepted submission.</p>
          </TechnicalDetails>
        </section>

        <section id="filter">
          <h2>Choose which clients you see.</h2>
          <p>Open <strong>Filters</strong> in the feed toolbar. Choose <strong>Include</strong> or <strong>Exclude</strong>, select a client, and choose <strong>Apply filters</strong>.</p>
          <p>Use <strong>Custom clients</strong> for other requesting client FIDs or exact signer public keys. <strong>Self-registered</strong> matches clients whose requesting FID is the cast author’s FID.</p>
          <ExpectedResult>Your selections appear as removable chips below the toolbar and the feed reloads. Choose <strong>Clear all</strong> to return to all clients.</ExpectedResult>
          <p>Include hides casts whose client cannot be resolved. Exclude keeps those casts unless an exact public-key filter matches.</p>
          <p>A requesting account helps identify a client, but does not guarantee its brand or trustworthiness. Unresolved keys appear as <strong>Unknown client</strong>.</p>
          <TechnicalDetails title="client attribution and signer records">
            <p>A cast’s signer is the app key that created it. Onchain metadata and gasless signer records link that key to its requesting FID. Kite shows the requester’s current username when available.</p>
            <p>Kite reads gasless requester FIDs from the unified signer API and retains onchain metadata lookup. Custody-phrase setup uses your own FID as requester, so its label identifies your account.</p>
            <p>Expired or removed gasless keys may no longer have an attribution record. Exact signer-key filters still work.</p>
          </TechnicalDetails>
        </section>

        <ProtocolConcepts/>

        <section id="troubleshoot">
          <h2>When things go wrong.</h2>
          <div className="troubleshooting">
            <h3>Not enough disk or memory</h3><p>Use a larger dedicated host. The provision command stops before filling a small machine with the network snapshot.</p>
            <h3>Docker permission denied</h3><p>On your server, grant the operator Docker access or run setup with appropriate privileges. Reconnect after changing group membership. Docker access grants powerful host privileges.</p>
            <h3>Node online, feed empty</h3><p>Check all shard delays, confirm the FID, and wait for initial sync. A healthy API process can still serve incomplete data.</p>
            <h3>No FID for the imported phrase</h3><p>Check the custody address and address index. Do not substitute a verified wallet or recovery phrase for the custody phrase.</p>
            <h3>Signer unknown, invalid, or revoked</h3><p>For onchain signers, wait for the registration event to reach the node and check the active Key Registry state. For gasless signers, check the node’s signer record and expiry. A revoked or expired key needs replacement.</p>
            <h3>Node returns 401 or 403</h3><p>Check the browser origin and the configured node’s access policy. The gateway must be able to read and submit signed messages through its HTTP API.</p>
            <h3>Cast prefix doesn’t work</h3><p>The lookup tool resolves short hashes by paging the author’s casts, then queries the full hash. Supply the correct FID; a username is not an FID.</p>
          </div>
        </section>

        <section className="sources">
          <h3>Go to the source.</h3><p>Protocol details change. These are the upstream references used for this implementation.</p>
          <a href="https://github.com/farcasterxyz/snapchain" target="_blank" rel="noreferrer">Snapchain implementation ↗</a>
          <a href="https://snapchain.farcaster.xyz/getting-started" target="_blank" rel="noreferrer">Official node setup ↗</a>
          <a href="https://snapchain.farcaster.xyz/node-types" target="_blank" rel="noreferrer">Snapchain node types ↗</a>
          <a href="https://github.com/farcasterxyz/hub-monorepo/tree/main/packages/core" target="_blank" rel="noreferrer">Farcaster TypeScript core ↗</a>
          <a href="https://github.com/farcasterxyz/contracts" target="_blank" rel="noreferrer">Farcaster contracts ↗</a>
        </section>
      </div>
    </div>
    <footer><strong className="footer-brand"><KiteMark/>kite</strong><p>Built for the freedom to choose your own feed. <a href="/endorsements">Endorsements ↗</a></p><span>MIT LICENSE · 2026</span></footer>
  </main>;
}
