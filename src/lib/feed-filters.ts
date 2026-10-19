import type { Cast } from './hub';

export const knownClients = [
  { fid: 9152, name: 'Warpcast' },
  { fid: 16823, name: 'Firefly', username: 'fireflyapp' },
] as const;

export type Filters = { mode: 'all' | 'include' | 'exclude'; clientFids: string; signerKeys: string; selfRegistered: boolean };
export const filterTokens = (value: string) => value.split(/[\s,]+/).filter(Boolean);

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
