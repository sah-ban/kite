import {safeLink} from './model';
import {castTextParts} from '../../../src/lib/mentions';

export type LinkedCastPart={text:string;url?:string;fid?:never}|{fid:number;text?:never;url?:never};

export function castTextLinkParts(text:string,mentions:readonly number[]=[],positions:readonly number[]=[],limit=Infinity):LinkedCastPart[]{
  const {parts}=castTextParts(text,mentions,positions);
  const linked:LinkedCastPart[]=[];let offset=0;
  for(const part of parts){
    if('fid' in part){if(offset<=limit)linked.push(part);continue;}
    // Find destinations before shortening the display text, so a clipped URL
    // still opens the original URL rather than a different, partial address.
    for(const link of textLinkParts(part.text)){
      const characters=Array.from(link.text),remaining=Math.max(0,limit-offset);
      if(remaining>0)linked.push({...link,text:characters.slice(0,remaining).join('')});
      offset+=characters.length;
    }
  }
  if(offset>limit)linked.push({text:'…'});
  return linked;
}

export function textLinkParts(text:string):{text:string;url?:string}[]{
  const parts:{text:string;url?:string}[]=[];let cursor=0;
  const pattern=/https?:\/\/[^\s<>"“”]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"“”]*)?/gi;
  for(const match of text.matchAll(pattern)){
    const index=match.index!;
    if(index>0&&/[\p{L}\p{N}_@.\/:\\-]/u.test(text[index-1])||text[index+match[0].length]==='@')continue;
    let value=match[0],previous;
    do{
      previous=value;value=value.replace(/[.,!?:;…’'`]+$/u,'');
      for(const [open,close] of [['(',')'],['[',']'],['{','}']])while(value.endsWith(close)&&value.split(close).length>value.split(open).length)value=value.slice(0,-1);
    }while(previous!==value);
    const url=safeLink(/^https?:\/\//i.test(value)?value:`https://${value}`);if(!url)continue;
    if(index>cursor)parts.push({text:text.slice(cursor,index)});
    parts.push({text:value,url});cursor=index+value.length;
  }
  if(cursor<text.length)parts.push({text:text.slice(cursor)});
  return parts;
}
