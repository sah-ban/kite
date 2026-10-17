import { useState, useEffect } from 'react';
import { KeyRound, Lock, ArrowRight, ExternalLink } from 'lucide-react';
import { type Config, localOrigin } from './lib/hub';
import { importExistingSigner, prepareKey, unlockSession, type PreparedKey, type Session } from './lib/signing';
import { storedAccount, forgetAppKey } from './lib/vault';
import { Modal } from './components';
import { Approval } from './Approval';

type Mode = 'approve' | 'signer' | 'seed' | 'unlock';

export function Account({ config, onSession, onClose }: {
  config: Config; onSession: (s: Session) => void; onClose: () => void;
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

  if (!localOrigin()) return (
    <Modal title="Connect with Farcaster" onClose={onClose}>
      <div className="account-icon"><Lock size={26} /></div>
      <Approval configured={Boolean(config.approvalConfigured)} onSession={onSession} onClose={onClose}/>
      <p className="small muted">Private-key and custody-phrase import remain available only on localhost.</p>
    </Modal>
  );

  return (
    <Modal
      title={pending ? 'Review app key registration' : mode === 'unlock' ? 'Unlock your app key' : 'Connect your account'}
      onClose={() => { if (!busy) onClose(); }}
    >
      <div className="account-icon"><KeyRound size={26} /></div>
      {pending ? <>
        <p>One Optimism transaction will authorize this app key to sign Farcaster messages for your account.</p>
        <dl className="registration-details">
          <dt>FID</dt><dd>{pending.fid}</dd>
          <dt>Custody address</dt><dd className="mono">{pending.address}</dd>
          <dt>App public key</dt><dd className="mono">{pending.key}</dd>
          <dt>Estimated execution gas</dt><dd>{pending.estimatedFee} ETH + L1 data fee</dd>
        </dl>
        <p className="small muted">The custody wallet must hold ETH on Optimism. The encrypted app key is saved before submission so you can recover it if confirmation is interrupted.</p>
        <button className="button primary full" disabled={busy} onClick={() => run(async () => {
          const session = await pending.register();
          setPassword('');
          onSession(session);
          onClose();
        })}>
          {busy ? 'Waiting for transaction…' : 'Register app key'} <ArrowRight size={16} />
        </button>
      </> : <><label>Connection method
        <select disabled={busy} value={mode} onChange={e => changeMode(e.target.value as Mode)}>
          <option value="approve">Approve a fresh signer in Farcaster</option>
          <option value="signer">Import existing signer</option>
          <option value="seed">Register a new key with a custody phrase</option>
          {saved && <option value="unlock">Unlock saved app key</option>}
        </select>
      </label>{mode==='approve'?<Approval configured={Boolean(config.approvalConfigured)} onSession={onSession} onClose={onClose}/>:<form onSubmit={e => {
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
          setPrivateKey('');
          setPassword('');
          onSession(session);
          onClose();
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
          <label>Custody seed phrase
            <textarea disabled={busy} autoComplete="off" spellCheck={false} value={phrase} onChange={e => setPhrase(e.target.value)} required rows={3} placeholder="Enter your 12 or 24 words" />
          </label>
          <label>Address derivation index
            <input disabled={busy} type="number" min={0} max={100} value={index} onChange={e => setIndex(e.target.value)} required />
          </label>
        </>}
        {mode === 'unlock' && <p>Unlock the encrypted app key for <strong>FID {saved?.fid}</strong>. Your custody phrase is not needed.</p>}
        <label>{mode === 'unlock' ? 'Encryption passphrase' : 'App key encryption passphrase'}
          <input disabled={busy} type="password" autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'} minLength={mode === 'unlock' ? undefined : 12} value={password} onChange={e => setPassword(e.target.value)} required placeholder={mode === 'unlock' ? 'Your local passphrase' : 'At least 12 characters'} />
        </label>
        <button className="button primary full" disabled={busy}>
          {busy ? 'Checking account…' : mode === 'seed' ? 'Prepare registration' : mode === 'signer' ? 'Verify and import signer' : 'Unlock app key'} <ArrowRight size={16} />
        </button>
      </form>}</>}
      {error && <div className="error" role="alert">{error}</div>}
      {saved && !pending && <div className="account-alternatives">
        <button disabled={busy} className="text-button danger" onClick={() => {
          forgetAppKey();
          setSaved(null);
          changeMode('signer');
        }}>Forget local app key</button>
        <p className="small muted">Forgetting removes only the encrypted browser copy. To revoke access, remove the key onchain.</p>
        <a className="small" href="https://optimistic.etherscan.io/address/0x00000000fc1237824fb747abde0ff18990e59b7e#writeContract" target="_blank" rel="noreferrer">Key Registry on Optimism <ExternalLink size={12} /></a>
      </div>}
    </Modal>
  );
}
