const hosts=new Set(['x.com','www.x.com','mobile.x.com','twitter.com','www.twitter.com','mobile.twitter.com']);
export function xPostURL(value){
  try{
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!hosts.has(url.hostname.toLowerCase()))return;
    const match=url.pathname.match(/^\/(?:([a-zA-Z0-9_]{1,15})\/status|i\/(?:web\/)?status)\/(\d{1,20})(?:\/(?:photo|video)\/\d+)?\/?$/);
    if(!match||BigInt(match[2])<=0n||BigInt(match[2])>18446744073709551615n)return;
    return {id:match[2],url:`https://x.com/${match[1]||'i'}/status/${match[2]}`};
  }catch{return;}
}
