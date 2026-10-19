// Registry policy: https://github.com/farcasterxyz/fname-registry/blob/main/src/transfers.ts
export const FNAME_COOLDOWN=28*24*60*60;
// Public reserved-name policy: https://github.com/farcasterxyz/fname-registry/blob/main/src/reserved.ts
const reserved=new Set(["adidas","amazon","apple","arbitrum","barackobama","bbc","billgates","binance","bitcoin","blockchain","bmw","cia","cloud","cnn","coinbase","consensys","context","crypto","data","dell","disney","drake","elonmusk","ethereum","f1","facebook","farcaster","farcaster-client","farcaster-xyz","farcasterxyz","fashion","fbi","fifa","finance","fitness","fnames","food","fwb","fwbdao","gallery","games","ge","gem","gm","gnosis","gnosissafe","google","health","hp","hyperverse","ibm","intel","invest","jpmorgan","kraken","kucoin","lebronjames","lionelmessi","luxury","messi","metamask","microsoft","midjourney","miniapp","miniapps","mirror","ml","money","nasa","nba","netflix","news","nfl","nike","nounsdao","obsidian","openai","opensea","optimism","oracle","ourzora","pga","poap","polygon","privacy","rainbow","rarible","ronaldo","samsung","sony","starknet","stripe","sudoswap","superrare","sushiswap","syndicate","tesla","tezos","travel","twitter","uber","un","uniswap","urbit","viamirror","vitalik","warpcast","www","youtube","zora","zoraco"]);
export function fnameName(value) {
  if(typeof value!=='string')throw new Error('Enter an fname.');
  const name=value.trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,15}$/.test(name))throw new Error('Use 1–16 lowercase letters, numbers or hyphens, starting with a letter or number. ENS names are managed separately.');
  return name;
}
export function claimableFname(value){const name=fnameName(value);if(reserved.has(name))throw new Error('This fname is reserved by the registry.');return name;}
export function ownsFnameProof(proof,name,fid) {
  if(proof?.fid!==fid||![1,'USERNAME_TYPE_FNAME'].includes(proof?.type)||typeof proof.name!=='string')return false;
  if(proof.name===name)return true;
  try{
    const bytes=proof.name.startsWith('0x')?Uint8Array.from(proof.name.slice(2).match(/.{2}/g)||[],pair=>parseInt(pair,16)):Uint8Array.from(atob(proof.name),character=>character.charCodeAt(0));
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes)===name;
  }catch{return false;}
}
