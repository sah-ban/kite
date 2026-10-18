export type CastTextPart = {text:string;fid?:never}|{fid:number;text?:never};

// Farcaster positions count UTF-8 bytes in the original text, before mentions
// are inserted. Map only character boundaries so malformed data cannot split emoji.
export function castTextParts(text:string,mentions:readonly number[]=[],positions:readonly number[]=[],limit=Infinity):{parts:CastTextPart[];truncated:boolean} {
  const characters=Array.from(text),truncated=characters.length>limit;
  const shown=characters.slice(0,limit).join('');
  const boundaries=new Map<number,number>([[0,0]]);
  const encoder=new TextEncoder();
  let bytes=0,index=0;
  for(const character of shown){bytes+=encoder.encode(character).length;index+=character.length;boundaries.set(bytes,index);}
  const insertions=mentions.slice(0,10).flatMap((fid,i)=>{
    const position=positions[i],offset=boundaries.get(position);
    return Number.isSafeInteger(fid)&&fid>0&&Number.isSafeInteger(position)&&offset!==undefined?[{fid,offset,i}]:[];
  }).sort((a,b)=>a.offset-b.offset||a.i-b.i);
  const parts:CastTextPart[]=[];
  let cursor=0;
  for(const {fid,offset} of insertions){
    if(offset>cursor)parts.push({text:shown.slice(cursor,offset)});
    parts.push({fid});cursor=offset;
  }
  if(cursor<shown.length)parts.push({text:shown.slice(cursor)});
  if(truncated)parts.push({text:'…'});
  return {parts,truncated};
}
