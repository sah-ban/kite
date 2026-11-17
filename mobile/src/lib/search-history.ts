import {parseSearch} from './model';

const LIMIT=8;
export function searchEntry(query:string){
  const value=query.trim();
  if(!value||value.length>2048)throw new Error('Enter a username, FID or cast link.');
  const target=parseSearch(value);
  return target.kind==='profile'
    ?{query:value,key:`profile:${target.value}`,kind:'profile' as const,label:/^\d+$/.test(target.value)?`FID ${target.value}`:`@${target.value}`}
    :{query:value,key:`cast:${target.author.toLowerCase()}:${target.hash}`,kind:'cast' as const,label:`${target.author} / ${target.hash.slice(0,10)}…`};
}
export function readSearchHistory(value:string|null):string[]{
  try{
    const parsed:unknown=JSON.parse(value||'[]');
    if(!Array.isArray(parsed))return [];
    const seen=new Set<string>(),result:string[]=[];
    for(const item of parsed){
      if(typeof item!=='string')continue;
      try{const entry=searchEntry(item);if(!seen.has(entry.key)){seen.add(entry.key);result.push(entry.query);}}catch{/* Skip invalid saved entries. */}
      if(result.length===LIMIT)break;
    }
    return result;
  }catch{return [];}
}
export function rememberSearch(history:string[],query:string){
  return readSearchHistory(JSON.stringify([query,...history]));
}
