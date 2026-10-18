import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './components';
import { resolveCast, type Cast, type Config } from './lib/hub';
import { resolveCastUrl } from './lib/cast-url';
import { resolveProfileSearch } from './lib/profile-search';

export function SearchDialog({ config, onClose, onFound, onProfile }: { config: Config; onClose: () => void; onFound: (cast: Cast) => void; onProfile: (fid: number) => void }) {
  const [mode, setMode] = useState<'url' | 'hash' | 'profile'>('url');
  const [url, setUrl] = useState(''), [fid, setFid] = useState('37'), [hash, setHash] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function reset() { request.current?.abort(); setBusy(false); setError(''); }
  return <Modal title="Search" onClose={onClose}>
    <p>{mode === 'profile' ? 'Find a profile by exact username, FID, or Farcaster profile URL.' : "Paste a Farcaster cast URL, or enter the author's FID and hash. Short hashes are resolved to the full cast hash using your read node."}</p>
    <div className="cast-type-tabs" aria-label="Search using">
      <button type="button" className={mode === 'url' ? 'selected' : ''} aria-pressed={mode === 'url'} onClick={() => { reset(); setMode('url'); }}>Cast URL</button>
      <button type="button" className={mode === 'hash' ? 'selected' : ''} aria-pressed={mode === 'hash'} onClick={() => { reset(); setMode('hash'); }}>FID and hash</button>
      <button type="button" className={mode === 'profile' ? 'selected' : ''} aria-pressed={mode === 'profile'} onClick={() => { reset(); setMode('profile'); }}>Profiles</button>
    </div>
    <form onSubmit={async event => {
      event.preventDefault(); reset();
      const controller = new AbortController(); request.current = controller; setBusy(true);
      try {
        if (mode === 'profile') {
          const fid = await resolveProfileSearch(config, query, controller.signal);
          if (!controller.signal.aborted) onProfile(fid);
          return;
        }
        const cast = mode === 'url' ? await resolveCastUrl(config, url, controller.signal) : await resolveCast(config, Number(fid), hash.trim(), controller.signal);
        if (!controller.signal.aborted) onFound(cast);
      } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }}>
      {mode === 'profile' ? <label>Username, FID or profile URL<input value={query} onChange={event => { reset(); setQuery(event.target.value); }} placeholder="@balajis.eth, 37 or https://farcaster.xyz/balajis.eth" autoCapitalize="none" spellCheck={false} required/></label> : mode === 'url' ? <label>Farcaster cast URL<input type="url" value={url} onChange={event => { reset(); setUrl(event.target.value); }} placeholder="https://farcaster.xyz/balajis.eth/0x50184b62" required autoFocus/></label> : <>
        <label>Author FID<input type="number" min="1" value={fid} onChange={event => { reset(); setFid(event.target.value); }} required/></label>
        <label>Cast hash<input value={hash} onChange={event => { reset(); setHash(event.target.value); }} placeholder="0x50184b62…" required/></label>
      </>}
      <button className="button primary full" disabled={busy}>{busy ? (mode === 'profile' ? 'Finding profile…' : 'Finding cast…') : (mode === 'profile' ? 'Find profile' : 'Find cast')}<Search size={16}/></button>
    </form>
    {error && <div className="error" role="alert">{error}</div>}
  </Modal>;
}
