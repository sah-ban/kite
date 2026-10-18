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

export type DraftMention={start:number;end:number;fid:number;label:string};
export function editMentions(previous:string,next:string,mentions:readonly DraftMention[]):DraftMention[]{
  let start=0,suffix=0;
  while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;
  while(suffix<previous.length-start&&suffix<next.length-start&&previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;
  const end=previous.length-suffix,shift=next.length-previous.length;
  return mentions.flatMap(mention=>{
    if(mention.end<=start)return [{...mention}];
    if(mention.start>=end)return [{...mention,start:mention.start+shift,end:mention.end+shift}];
    return [];
  }).filter(mention=>next.slice(mention.start,mention.end)===mention.label&&!/^(?:[a-z0-9_-]|\.[a-z0-9])/i.test(next.slice(mention.end)));
}
export function encodeMentionText(text:string,mentions:readonly DraftMention[]=[]){
  if(mentions.length>10)throw new Error('A cast can mention up to 10 accounts.');
  let cursor=0,body='';const fids:number[]=[],positions:number[]=[];
  for(const mention of [...mentions].sort((a,b)=>a.start-b.start)){
    if(!Number.isSafeInteger(mention.fid)||mention.fid<=0||!Number.isSafeInteger(mention.start)||!Number.isSafeInteger(mention.end)||mention.start<cursor||mention.end<=mention.start||mention.end>text.length||text.slice(mention.start,mention.end)!==mention.label)throw new Error('A mention changed. Select the account again.');
    body+=text.slice(cursor,mention.start);positions.push(new TextEncoder().encode(body).length);fids.push(mention.fid);cursor=mention.end;
  }
  body+=text.slice(cursor);
  return {text:body,mentions:fids,mentionsPositions:positions};
}
export function mentionQuery(text:string,caret:number){
  const match=text.slice(0,caret).match(/(?:^|[\s([{])@([a-z0-9_.-]*)$/i);
  if(!match)return undefined;
  const start=caret-match[1].length-1;
  const tail=text.slice(caret).match(/^[a-z0-9_.-]*/i)![0];
  return {start,end:caret+tail.length,query:match[1].toLowerCase()};
}
