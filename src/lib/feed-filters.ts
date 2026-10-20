import type { Cast } from './hub';

export const knownClients = [
  { fid: 9152, name: 'Warpcast' },
  { fid: 16823, name: 'Firefly', username: 'fireflyapp' },
] as const;

export type Filters = { mode: 'all' | 'include' | 'exclude'; clientFids: string; signerKeys: string; selfRegistered: boolean };
export const filterTokens = (value: string) => value.split(/[\s,]+/).filter(Boolean);

export function filterChips(filters:Filters):{id:string;label:string}[] {
  if(filters.mode==='all')return [];
  return [
    ...[...new Set(filterTokens(filters.clientFids).map(Number))].map(fid=>({id:`client:${fid}`,label:knownClients.find(client=>client.fid===fid)?.name||`Client ${fid}`})),
    ...(filters.selfRegistered?[{id:'self',label:'Self-registered'}]:[]),
    ...[...new Set(filterTokens(filters.signerKeys).map(key=>key.toLowerCase()))].map(key=>({id:`key:${key}`,label:`App key ${key.slice(0,8)}…${key.slice(-4)}`})),
  ];
}
export function removeFilter(filters:Filters,id:string):Filters {
  const next={...filters};
  if(id==='self')next.selfRegistered=false;
  if(id.startsWith('client:'))next.clientFids=filterTokens(next.clientFids).filter(value=>Number(value)!==Number(id.slice(7))).join(', ');
  if(id.startsWith('key:'))next.signerKeys=filterTokens(next.signerKeys).filter(key=>key.toLowerCase()!==id.slice(4).toLowerCase()).join(', ');
  if(!filterTokens(next.clientFids).length&&!filterTokens(next.signerKeys).length&&!next.selfRegistered)next.mode='all';
  return next;
}

export function filterByClient(casts: Cast[], filters: Filters, attribution: Map<string, number>): Cast[] {
  if (filters.mode === 'all') return casts;
  const fids = new Set(filterTokens(filters.clientFids).map(Number));
  const keys = new Set(filterTokens(filters.signerKeys).map(key => key.toLowerCase()));
  return casts.filter(cast => {
    const key = cast.signer?.toLowerCase();
    const requester = key ? attribution.get(key) : undefined;
    const matches = Boolean(key && keys.has(key)) || (requester !== undefined &&
      (fids.has(requester) || (filters.selfRegistered && requester === cast.data.fid)));
    return filters.mode === 'include' ? matches : !matches;
  });
}
