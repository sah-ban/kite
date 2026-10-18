import { hub, type Config } from './hub';

export function parseProfileSearch(value: string): { fid: number } | { username: string } {
  let author = value.trim();
  const invalid = () => new Error('Enter an exact username, a positive FID, or a Farcaster profile URL.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(author) || author.includes('/')) {
    let url: URL;
    try { url = new URL(author); } catch { throw invalid(); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
        !['farcaster.xyz', 'www.farcaster.xyz', 'warpcast.com', 'www.warpcast.com'].includes(url.hostname)) throw invalid();
    const match = url.pathname.match(/^\/([a-zA-Z0-9][a-zA-Z0-9.-]*)\/?$/);
    if (!match) throw invalid();
    author = match[1];
  }
  author = author.replace(/^@/, '').toLowerCase();
  if (/^[0-9]+$/.test(author)) {
    const fid = Number(author);
    if (!Number.isSafeInteger(fid) || fid <= 0) throw invalid();
    return { fid };
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(author)) throw invalid();
  return { username: author };
}

export async function resolveProfileSearch(config: Config, value: string, signal?: AbortSignal): Promise<number> {
  const parsed = parseProfileSearch(value);
  if ('fid' in parsed) return parsed.fid;
  const { username } = parsed;
  let proof: { fid: number };
  try {
    proof = await hub(config, 'userNameProofByName', { name: username }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Could not find @${username} on your read node. Check the exact username or try their FID.`);
  }
  if (!Number.isSafeInteger(proof.fid) || proof.fid <= 0) throw new Error(`No profile found for @${username}. Try their FID.`);
  return proof.fid;
}
