import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Config } from './lib/hub';
import { readConnectedClients, type ConnectedClient, type ConnectedClientsData } from './lib/connected-clients';
import { Avatar, useProfile } from './social-ui';

function ClientChip({config,client,onProfile}:{config:Config;client:ConnectedClient;onProfile:(fid:number)=>void}) {
  const person=useProfile(config,client.fid);
  const name=person?.displayName||(person?.username?`@${person.username}`:`Client FID ${client.fid}`),detail=person?.displayName&&person.username?`@${person.username}`:`FID ${client.fid}`;
  return <a className="connected-client" href={`/profile/${client.fid}`} onClick={event=>{event.preventDefault();onProfile(client.fid);}} title={`${client.keyCount} active key${client.keyCount===1?'':'s'}`}><Avatar person={person}/><span><strong>{name}</strong><small>{detail}</small></span><ArrowUpRight size={13}/></a>;
}
export function ConnectedClients({config,fid,revision,onProfile}:{config:Config;fid:number;revision:number;onProfile:(fid:number)=>void}) {
  const [data,setData]=useState<ConnectedClientsData>(),[error,setError]=useState(false),[retry,setRetry]=useState(0),[limit,setLimit]=useState(6);
  useEffect(()=>{
    const abort=new AbortController();setData(undefined);setError(false);setLimit(6);
    readConnectedClients(config,fid,abort.signal).then(value=>{if(!abort.signal.aborted)setData(value);}).catch(()=>{if(!abort.signal.aborted)setError(true);});
    return()=>abort.abort();
  },[config,fid,revision,retry]);
  const count=data?data.clients.length+(data.unknownKeys?1:0):undefined;
  return <section className="profile-connected-clients" aria-label="Connected clients">
    <h3>Connected clients</h3>
    {error?<p className="small muted" role="status">Couldn’t load connected clients. <button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={12}/>Retry</button></p>:!data?<p className="small muted" role="status">Loading connected clients…</p>:!count?<p className="small muted">No connected clients found on this node.</p>:<>
      <div className="connected-client-list">{data.clients.slice(0,limit).map(client=><ClientChip key={client.fid} config={config} client={client} onProfile={onProfile}/>)}{data.unknownKeys>0&&<div className="connected-client unknown-client"><span><strong>Unknown client</strong><small>{data.unknownKeys} active key{data.unknownKeys===1?'':'s'} without client attribution</small></span></div>}</div>
      {data.clients.length>limit&&<button type="button" className="text-button connected-clients-more" onClick={()=>setLimit(value=>value+6)}>Show more clients ({data.clients.length-limit})</button>}
    </>}
  </section>;
}
