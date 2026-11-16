export type Cast = {
  hash: string;
  signer: string;
  data: {fid: number; timestamp: number; castAddBody: {
    text: string; mentions?: number[]; mentionsPositions?: number[];
    parentCastId?: {fid: number; hash: string};
    parentUrl?:string;
    embeds?: {url?: string; castId?: {fid: number; hash: string}}[];
    embedsDeprecated?: string[];
    formatVersion?:number;
    chain?:{root?:{fid:number;hash:string};index:number;count:number};
  }};
};
export type Profile = {fid: number; name: string; username: string; avatar: string; bio: string; banner: string; website: string;twitterUsername?:string};
export type Page<T> = {items: T[]; next: string};
export const isFid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export const isHash = (value: unknown): boolean => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
export function isCast(value: unknown): value is Cast {
  const cast = value as Cast | undefined;
  return !!cast && isHash(cast.hash) && isFid(cast.data?.fid) && typeof cast.data?.castAddBody?.text === 'string';
}
export function mergeCasts(before: Cast[], after: Cast[]) {
  return [...new Map([...before, ...after].map(cast => [`${cast.data.fid}:${cast.hash.toLowerCase()}`, cast])).values()];
}
export const castRoute = (cast: Pick<Cast, 'data'|'hash'>) => `/cast/${cast.data.fid}/${cast.hash}` as const;
export const castKey = (cast: {data:{fid:number};hash:string}) => `${cast.data.fid}:${cast.hash.toLowerCase()}`;
export const castDate = (timestamp: number) => new Date((timestamp + 1609459200) * 1000);
export function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - castDate(timestamp).getTime()) / 1000));
  for (const [unit, size] of [['y',31536000],['mo',2592000],['d',86400],['h',3600],['m',60]] as const) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${unit}`;
  }
  return 'now';
}
export function safeLink(value: string): string | undefined {
  try {const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;} catch {return undefined;}
}
export function normalizeServer(value: string): string {
  let url: URL;
  try {url = new URL(value.trim());} catch {throw new Error('Enter a complete HTTPS Kite server URL.');}
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS server address without a path, credentials or query.');
  return url.origin;
}
export type SearchTarget = {kind: 'profile'; value: string} | {kind: 'cast'; author: string; hash: string};
export function parseSearch(value: string): SearchTarget {
  let input = value.trim();
  if (input.includes('://')) {
    let url: URL;
    try {url = new URL(input);} catch {throw new Error('Enter a username, FID or cast link.');}
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !['kite.sahban.dev','farcaster.xyz','www.farcaster.xyz','warpcast.com','www.warpcast.com'].includes(url.hostname)) throw new Error('Use a Kite or Farcaster profile or cast link.');
    input = url.pathname;
  }
  const cast = input.match(/^\/?(?:cast\/)?([a-z0-9.-]+)\/(0x[0-9a-f]{8,40})\/?$/i);
  if (cast) return {kind:'cast',author:cast[1],hash:cast[2].toLowerCase()};
  const profile = input.replace(/^\/?(?:~\/profiles|profile)\//, '').replace(/^\//, '').replace(/\/$/, '').replace(/^@/,'').toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(profile) || (/^\d+$/.test(profile) && !isFid(Number(profile)))) throw new Error('Enter an exact username, positive FID or cast link.');
  return {kind:'profile',value:profile};
}
