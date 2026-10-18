import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Modal, Code } from './components';
import { resolveCast, type Cast, type Config } from './lib/hub';
import { resolveCastUrl } from './lib/cast-url';

export function FindCast({ config, onClose, renderCast }: { config: Config; onClose: () => void; renderCast: (cast: Cast) => ReactNode }) {
  const [mode, setMode] = useState<'url' | 'hash'>('url');
  const [url, setUrl] = useState(''), [fid, setFid] = useState('37'), [hash, setHash] = useState('');
  const [result, setResult] = useState<Cast | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function reset() { request.current?.abort(); setBusy(false); setResult(null); setError(''); }
  return <Modal title="Find a cast" onClose={onClose}>
    <p>Paste a Farcaster cast URL, or enter the author's FID and hash. Short hashes are resolved to the full cast hash using your read node.</p>
    <div className="cast-type-tabs" aria-label="Find cast using">
      <button type="button" className={mode === 'url' ? 'selected' : ''} aria-pressed={mode === 'url'} onClick={() => { reset(); setMode('url'); }}>Cast URL</button>
      <button type="button" className={mode === 'hash' ? 'selected' : ''} aria-pressed={mode === 'hash'} onClick={() => { reset(); setMode('hash'); }}>FID and hash</button>
    </div>
    <form onSubmit={async event => {
      event.preventDefault(); reset();
      const controller = new AbortController(); request.current = controller; setBusy(true);
      try {
        const cast = mode === 'url' ? await resolveCastUrl(config, url, controller.signal) : await resolveCast(config, Number(fid), hash.trim(), controller.signal);
        if (!controller.signal.aborted) setResult(cast);
      } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }}>
      {mode === 'url' ? <label>Farcaster cast URL<input type="url" value={url} onChange={event => { reset(); setUrl(event.target.value); }} placeholder="https://farcaster.xyz/balajis.eth/0x50184b62" required autoFocus/></label> : <>
        <label>Author FID<input type="number" min="1" value={fid} onChange={event => { reset(); setFid(event.target.value); }} required/></label>
        <label>Cast hash<input value={hash} onChange={event => { reset(); setHash(event.target.value); }} placeholder="0x50184b62…" required/></label>
      </>}
      <button className="button primary full" disabled={busy}>{busy ? 'Finding cast…' : 'Find cast'}<Search size={16}/></button>
    </form>
    {error && <div className="error" role="alert">{error}</div>}
    {result && <><Code label="FULL CAST HASH">{result.hash}</Code>{renderCast(result)}</>}
  </Modal>;
}
