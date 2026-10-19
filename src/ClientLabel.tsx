import { useEffect, useState } from 'react';
import { profile, type Config } from './lib/hub';
import { signerRequester } from './lib/attribution';

export function ClientLabel({config, fid, signer, onProfile, viaOnly=false}: {config: Config; fid: number; signer: string; onProfile:(fid:number)=>void;viaOnly?:boolean}) {
  const [client, setClient] = useState<{fid?: number; username?: string; loading: boolean}>({loading: true});
  useEffect(() => {
    let active = true;
    if(!/^0x[\da-f]{64}$/i.test(signer)){setClient({loading:false});return;}
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

  const label = client.loading ? 'Resolving client…' : 'Unknown client';
  const title = client.fid
    ? `Registered signer requester: ${client.username ? `@${client.username}, ` : ''}FID ${client.fid}. This identifies the key requester, which may differ from the app brand.\nSigner: ${signer}`
    : signer?`Signer: ${signer}`:'Signer attribution is unavailable.';
  return client.fid
    ? <a className="signer" href={`/profile/${client.fid}`} onClick={event=>{event.preventDefault();onProfile(client.fid!);}} title={title}>{viaOnly?'via ':<><span className="client-prefix-long">casted from </span><span className="client-prefix-short">via </span></>}<span className="client-username">{client.username?`@${client.username}`:`Client FID ${client.fid}`}</span></a>
    : <span className="signer" title={title}>{label}</span>;
}
