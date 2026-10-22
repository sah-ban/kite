import { xHandle } from './x-handle';
export type Cast = { hash: string; signer: string; data: { fid: number; timestamp: number; castAddBody: { text: string; mentions: number[]; mentionsPositions: number[]; parentCastId?: { fid: number; hash: string }; parentUrl?:string; embedsDeprecated?:string[]; type?:number|string; embeds: { url?: string; castId?: { fid: number; hash: string } }[] } } };
export type Profile = { fid: number; name: string; username: string; avatar: string; bio: string; banner?: string; website?:string; displayName?:string;twitterUsername?:string;githubUsername?:string;location?:string;primaryEthereumAddress?:string;primarySolanaAddress?:string;profileToken?:string;liveActivityUrl?:string };
export type Config = { readUrl: string; optimismRpcUrl: string; useGateway?: boolean; approvalConfigured?: boolean; indexedFeedEnabled?:boolean; indexedFeedFids?:number[]; defaultFeedFid?:number };
export type NodeInfo = { version: string; dbStats?: { numMessages: number }; shardInfos: { shardId: number; maxHeight: number; blockDelay: number }[] };
export type HubMessage = { data: { type?: string | number; userDataBody?: { type: string | number; value: string }; linkBody?: { targetFid: number } }; signer?: string };
export class HubError extends Error {
  readonly notFound: boolean;
  constructor(public status: number, body: string) {
    super(`Node returned ${status}: ${body.slice(0,250)}`);
    this.notFound=status===404;
    // Snapchain's HTTP gateway can wrap gRPC NotFound in HTTP 400.
    if(status===400)try{
      const detail=JSON.parse(body)?.error_detail;
      this.notFound=typeof detail==='string'&&/^status:\s*NotFound(?:,|$)/.test(detail);
    }catch{/* Other bad requests must remain errors. */}
  }
}
export function onlyCastAdds(messages: unknown[]): Cast[] {
  return messages.filter((message): message is Cast => {
    const m=message as Partial<Cast>;
    return typeof m?.hash==='string'&&typeof m?.signer==='string'&&typeof m?.data?.fid==='number'&&typeof m?.data?.castAddBody?.text==='string';
  });
}
export const localOrigin = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export async function getConfig(signal?:AbortSignal): Promise<Config> {
  const response = await fetch('/api/config',{signal});
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Start the Kite server and configure your node in its local .env.');
  }
  const config: Config = await response.json();
  for (const label of ['readUrl', 'optimismRpcUrl'] as const) {
    const value = config[label];
    try {
      if (typeof value !== 'string' || !value) throw new Error();
      const url = new URL(value, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      config[label] = url.href;
    } catch {
      throw new Error(`Invalid ${label} in server configuration. Use an HTTP or HTTPS URL and restart.`);
    }
  }
  return { ...config, useGateway: true };
}
export async function hub<T>(config: Config, endpoint: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const base = config.useGateway || localOrigin() ? '/api/read' : config.readUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/v1/${endpoint}?${new URLSearchParams(Object.entries(params).map(([k,v]) => [k,String(v)]))}`, { signal: signal || AbortSignal.timeout(25_000) });
  if (!response.ok) throw new HubError(response.status, await response.text());
  const result = await response.json();
  // castsByFid can contain CAST_REMOVE tombstones as well as visible casts.
  if (['castsByFid','castsByParent','castsByMention'].includes(endpoint) && Array.isArray(result.messages)) result.messages=onlyCastAdds(result.messages);
  return result;
}
const profileListeners=new Set<()=>void>();
let profileVersion=0;
export const subscribeProfiles=(listener:()=>void)=>{profileListeners.add(listener);return()=>{profileListeners.delete(listener);};};
export const getProfileVersion=()=>profileVersion;
export function invalidateProfile(fid:number){profiles.delete(fid);profileVersion++;for(const listener of profileListeners)listener();}
const profiles = new Map<number, Promise<Profile>>();
export function profile(config: Config, fid: number): Promise<Profile> {
  const cached=profiles.get(fid);if(cached)return cached;
  const pending=hub<{ messages: HubMessage[] }>(config,'userDataByFid',{fid}).then(({messages}) => {
    const value = (type: string, n: number) => messages.find(m => m.data.userDataBody?.type === type || m.data.userDataBody?.type === n)?.data.userDataBody?.value || '';
    return {fid, displayName:value('USER_DATA_TYPE_DISPLAY',2),website:value('USER_DATA_TYPE_URL',5),name:value('USER_DATA_TYPE_DISPLAY',2)||`FID ${fid}`, username:value('USER_DATA_TYPE_USERNAME',6),avatar:value('USER_DATA_TYPE_PFP',1),bio:value('USER_DATA_TYPE_BIO',3),banner:value('USER_DATA_TYPE_BANNER',10),twitterUsername:xHandle(value('USER_DATA_TYPE_TWITTER',8)),githubUsername:value('USER_DATA_TYPE_GITHUB',9),location:value('USER_DATA_TYPE_LOCATION',7),primaryEthereumAddress:value('USER_DATA_PRIMARY_ADDRESS_ETHEREUM',11),primarySolanaAddress:value('USER_DATA_PRIMARY_ADDRESS_SOLANA',12),profileToken:value('USER_DATA_TYPE_PROFILE_TOKEN',13),liveActivityUrl:value('USER_DATA_TYPE_LIVE_AT',14)};
  }).catch(error=>{if(profiles.get(fid)===pending)profiles.delete(fid);throw error;});
  profiles.set(fid,pending);return pending;
}
export function filterBySigner(casts: Cast[], keys: string[], mode: 'all' | 'include' | 'exclude'): Cast[] {
  if (mode === 'all' || !keys.length) return casts;
  const set = new Set(keys.map(k => k.toLowerCase()));
  return casts.filter(c => mode === 'include' ? set.has(c.signer.toLowerCase()) : !set.has(c.signer.toLowerCase()));
}
export async function following(config: Config, fid: number): Promise<number[]> {
  let token = ''; const fids = new Set<number>();
  do {
    const page = await hub<{ messages: HubMessage[]; nextPageToken?: string }>(config, 'linksByFid', { fid, link_type: 'follow', pageSize: 100, ...(token ? { pageToken: token } : {}) });
    for (const m of page.messages) if ((m.data.type==='MESSAGE_TYPE_LINK_ADD'||m.data.type===5)&&m.data.linkBody?.targetFid) fids.add(m.data.linkBody.targetFid);
    token = page.nextPageToken || '';
  } while (token);
  return [...fids];
}
export function fullHash(value: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(value); }
export async function resolveCast(config: Config, fid: number, hash: string, signal?: AbortSignal): Promise<Cast> {
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Use a positive numeric FID.');
  if (!/^0x[0-9a-fA-F]{8,40}$/.test(hash)) throw new Error('Use a Farcaster cast hash beginning with 0x.');
  if (fullHash(hash)) return hub(config, 'castById', { fid, hash }, signal);
  let token = '';
  do {
    const page = await hub<{ messages: Cast[]; nextPageToken?: string }>(config, 'castsByFid', {fid,pageSize:1000,reverse:'true',...(token ? {pageToken:token} : {})}, signal);
    const matches = page.messages.filter(c => c.hash.toLowerCase().startsWith(hash.toLowerCase()));
    if (matches.length > 1) throw new Error('This hash prefix is ambiguous. Use the full hash.');
    if (matches[0]) return hub(config,'castById',{fid,hash:matches[0].hash}, signal);
    token = page.nextPageToken || '';
  } while (token);
  throw new Error('Cast not found for that FID and hash.');
}
export const castDate = (timestamp: number) => new Date((timestamp + 1609459200) * 1000);
