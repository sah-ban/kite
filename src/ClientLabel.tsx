import { useEffect, useState } from 'react';
import { profile, type Config } from './lib/hub';
import { signerRequester } from './lib/attribution';

export function ClientLabel({config, fid, signer, onProfile}: {config: Config; fid: number; signer: string; onProfile:(fid:number)=>void}) {
  const [client, setClient] = useState<{fid?: number; username?: string; loading: boolean}>({loading: true});
  useEffect(() => {
    let active = true;
    setClient({loading: true});
    (async () => {
      const requester = await signerRequester(config, fid, signer);
      if (!active) return;
      setClient({fid: requester, loading: false});
      if (!requester) return;
      const account = await profile(config, requester).catch(() => undefined);
      if (active) setClient({fid: requester, username: account?.username, loading: false});
    })().catch(() => { if (active) setClient({loading: false}); });
    return () => { active = false; };
  }, [config, fid, signer]);

  const label = client.username ? `casted from @${client.username}` : client.fid ? `casted from Client FID ${client.fid}` : client.loading ? 'Resolving client…' : 'Unknown client';
  const title = client.fid
    ? `Registered signer requester: ${client.username ? `@${client.username}, ` : ''}FID ${client.fid}. This identifies the key requester, which may differ from the app brand.\nSigner: ${signer}`
    : `Signer: ${signer}`;
  return client.fid
    ? <a className="signer" href={`/profile/${client.fid}`} onClick={event=>{event.preventDefault();onProfile(client.fid!);}} title={title} aria-label={label}>{label}</a>
    : <span className="signer" title={title}>{label}</span>;
}
