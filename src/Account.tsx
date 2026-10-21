import { useState, useEffect } from 'react';
import { KeyRound, Lock, ArrowRight, ExternalLink } from 'lucide-react';
import { type Config, localOrigin } from './lib/hub';
import { importExistingSigner, prepareKey, unlockSession, type PreparedKey, type Session } from './lib/signing';
import { storedAccount, forgetAppKey, rememberAppKey, clearRememberedAppKey, AccountAccessChangedError, REMEMBER_DAYS } from './lib/vault';
import { Modal } from './components';
import { Approval } from './Approval';
import {LocalToolsHint} from './LocalToolsHint';

type Mode = 'approve' | 'signer' | 'seed' | 'unlock';

export function Account({ config, onSession, onClose, onNotice }: {
  config: Config; onSession: (s: Session) => void; onClose: () => void; onNotice: (message: string) => void;
}) {
  const [saved, setSaved] = useState(storedAccount);
  const [mode, setMode] = useState<Mode>(saved ? 'unlock' : config.approvalConfigured ? 'approve' : 'signer');
  const [phrase, setPhrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [fid, setFid] = useState(saved ? String(saved.fid) : '');
  const [password, setPassword] = useState('');
  const [index, setIndex] = useState('0');
  const [pending, setPending] = useState<PreparedKey | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => () => { pending?.discard(); }, [pending]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setPhrase('');
    setPrivateKey('');
    setPassword('');
  }

  async function finish(session: Session) {
    try {
      if(!session.remote&&remember)session.remembered=await rememberAppKey(password,session);
      else await clearRememberedAppKey();
    } catch (error) {
      if(error instanceof AccountAccessChangedError){
        setPrivateKey('');setPassword('');
        onNotice('Account access changed in another tab. Unlock the saved app key again to reconnect.');
        onClose();return;
      }
      onNotice('Account connected for this tab. This browser could not save remembered access; use your passphrase after refreshing.');
    }
    setPrivateKey('');
    setPassword('');
    onSession(session);
    onClose();
  }

  const rememberOption=<label className="remember-device">
    <input type="checkbox" checked={remember} disabled={busy} onChange={event=>setRemember(event.target.checked)} aria-describedby="remember-device-hint"/>
    <span>Remember this device<small id="remember-device-hint">Stay connected after refreshing for {REMEMBER_DAYS} days. Anyone using this browser can post while connected. Your passphrase is never saved.</small></span>
  </label>;

  if (!localOrigin()) return (
    <Modal title="Connect with Farcaster" onClose={onClose}>
      <div className="account-icon"><Lock size={26} /></div>
      <Approval config={config} onSession={session=>{void finish(session);}} onClose={()=>{}}/>
      <LocalToolsHint kind="account"/>
    </Modal>
  );

  return (
    <Modal
      title={pending ? 'Review app key registration' : mode === 'unlock' ? 'Unlock your app key' : 'Connect your account'}
      onClose={() => { if (!busy) onClose(); }}
    >
      <div className="account-icon"><KeyRound size={26} /></div>
      {pending ? <>
        <p>Authorize this app key with a gasless signature. Registration is submitted to your configured node; no Optimism transaction or ETH is required.</p>
        <dl className="registration-details">
          <dt>FID</dt><dd>{pending.fid}</dd>
          <dt>Custody address</dt><dd className="mono">{pending.address}</dd>
          <dt>App public key</dt><dd className="mono">{pending.key}</dd>
          <dt>Client account</dt><dd>Your account · FID {pending.fid}</dd>
          <dt>Registration fee</dt><dd>No gas required</dd>
          <dt>Key expiry</dt><dd>{pending.ttlSeconds / 86400} days of inactivity</dd>
          <dt>Permissions</dt><dd>Publish and delete casts, like, recast, follow, unfollow and edit your profile</dd>
        </dl>
        <p className="small muted">The encrypted app key is saved before submission so you can unlock it if the request is interrupted. Active use refreshes its expiry.</p>
        {rememberOption}
        <button className="button primary full" disabled={busy} onClick={() => run(async () => {
          const session = await pending.register();
          await finish(session);
        })}>
          {busy ? 'Registering app key…' : 'Register app key (gasless)'} <ArrowRight size={16} />
        </button>
      </> : <><label>Connection method
        <select disabled={busy} value={mode} onChange={e => changeMode(e.target.value as Mode)}>
          <option value="approve">Approve a fresh signer in Farcaster</option>
          <option value="signer">Import existing signer</option>
          <option value="seed">Register a new key with a custody phrase</option>
          {saved && <option value="unlock">Unlock saved app key</option>}
        </select>
      </label>{mode==='approve'?<Approval config={config} onSession={session=>{void finish(session);}} onClose={()=>{}}/>:<form onSubmit={e => {
        e.preventDefault();
        run(async () => {
          if (mode === 'seed') {
            const prepared = await prepareKey(config, phrase, password, Number(index));
            setPhrase('');
            setPending(prepared);
            return;
          }
          const session = mode === 'signer'
            ? await importExistingSigner(config, Number(fid), privateKey, password)
            : await unlockSession(config, password);
          await finish(session);
        });
      }}>
        {mode === 'signer' && <>
          <p>Reuse an Ed25519 signer already registered to your account. This checks its public key, FID, and active storage before saving an encrypted local copy. No registration transaction is sent.</p>
          <label>Account FID
            <input disabled={busy} type="number" min={1} step={1} value={fid} onChange={e => setFid(e.target.value)} required placeholder="Your numeric FID" />
          </label>
          <label>Private signer key
            <input disabled={busy} type="password" autoComplete="off" spellCheck={false} value={privateKey} onChange={e => setPrivateKey(e.target.value)} required placeholder="32-byte Ed25519 key, optionally starting with 0x" />
          </label>
          <p className="small muted">Use the delegated Farcaster signer, not an Ethereum wallet or payout-signing key. This version checks onchain registration; gasless-only signers are not supported yet.</p>
        </>}
        {mode === 'seed' && <>
          <p>Use the seed phrase that controls an existing Farcaster FID with active storage. It stays in this browser's memory during setup.</p>
          <p className="signer-attribution-note">Casts made with this key will show your own account as the client.</p>
          <label>Custody seed phrase
            <textarea disabled={busy} autoComplete="off" spellCheck={false} value={phrase} onChange={e => setPhrase(e.target.value)} required rows={3} placeholder="Enter your 12 or 24 words" />
          </label>
          <details className="custody-advanced">
            <summary>Advanced options</summary>
            <label>Address derivation index
              <input disabled={busy} type="number" min={0} max={100} value={index} onChange={e => setIndex(e.target.value)} required />
            </label>
          </details>
        </>}
        {mode === 'unlock' && <p>Unlock the encrypted app key for <strong>FID {saved?.fid}</strong>. Your custody phrase is not needed.</p>}
        <label>{mode === 'unlock' ? 'Encryption passphrase' : 'App key encryption passphrase'}
          <input disabled={busy} type="password" autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'} minLength={mode === 'unlock' ? undefined : 12} value={password} onChange={e => setPassword(e.target.value)} required placeholder={mode === 'unlock' ? 'Your local passphrase' : 'At least 12 characters'} />
        </label>
        {rememberOption}
        <button className="button primary full" disabled={busy}>
          {busy ? 'Checking account…' : mode === 'seed' ? 'Prepare registration' : mode === 'signer' ? 'Verify and import signer' : 'Unlock app key'} <ArrowRight size={16} />
        </button>
      </form>}</>}
      {error && <div className="error" role="alert">{error}</div>}
      {saved && !pending && <div className="account-alternatives">
        <button disabled={busy} className="text-button danger" onClick={() => run(async () => {
          await forgetAppKey();
          setSaved(null);
          changeMode('signer');
        })}>Forget local app key</button>
        <p className="small muted">Forgetting removes only the encrypted browser copy.{saved.registration==='gasless'?' It does not revoke the gasless key.':' To revoke access, remove the key onchain.'}</p>
        <a className="small" href={saved.registration==='gasless'?'https://snapchain.farcaster.xyz/guides/writing-messages':'https://optimistic.etherscan.io/address/0x00000000fc1237824fb747abde0ff18990e59b7e#writeContract'} target="_blank" rel="noreferrer">{saved.registration==='gasless'?'Gasless signer documentation':'Key Registry on Optimism'} <ExternalLink size={12} /></a>
      </div>}
    </Modal>
  );
}
