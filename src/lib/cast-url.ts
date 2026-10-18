import { hub, resolveCast, type Cast, type Config } from './hub';

export function parseCastUrl(value: string): { author: string; hash: string } {
  const invalid = () => new Error('Use a Farcaster cast URL, such as https://farcaster.xyz/balajis.eth/0x50184b62.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['farcaster.xyz', 'www.farcaster.xyz', 'warpcast.com', 'www.warpcast.com'].includes(url.hostname)) throw invalid();
  const match = url.pathname.match(/^\/([a-zA-Z0-9][a-zA-Z0-9.-]*)\/(0x[0-9a-fA-F]{8,40})\/?$/);
  if (!match) throw invalid();
  return { author: match[1].toLowerCase(), hash: match[2].toLowerCase() };
}

export async function resolveCastUrl(config: Config, value: string, signal?: AbortSignal): Promise<Cast> {
  const { author, hash } = parseCastUrl(value);
  let fid: number;
  if (/^[0-9]+$/.test(author)) fid = Number(author);
  else {
    try {
      const proof = await hub<{ fid: number }>(config, 'userNameProofByName', { name: author }, signal);
      fid = proof.fid;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`Could not resolve @${author} on your read node. Try the author's FID and hash instead.`);
    }
  }
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Could not find a valid author FID for this URL. Try FID and hash instead.');
  return resolveCast(config, fid, hash, signal);
}
