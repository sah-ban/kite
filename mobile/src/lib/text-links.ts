import {safeLink} from './model';

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
