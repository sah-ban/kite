export function linkURL(value) {
  if(typeof value!=='string')throw new Error('Enter a valid HTTP or HTTPS link.');
  let url;try{url=new URL(value);}catch{throw new Error('Enter a valid HTTP or HTTPS link.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||new TextEncoder().encode(url.href).length>256)throw new Error('Use an HTTP or HTTPS link up to 256 UTF-8 bytes, without a username or password.');
  return url.href;
}
export function linkEmbeds(values,available=2) {
  if(!Array.isArray(values)||values.length>available)throw new Error(`Attach up to ${Math.max(0,available)} more links.`);
  return [...new Set(values.map(linkURL))].map(url=>({url}));
}
export function textLinks(text) {
  const links=[];
  for(const match of text.matchAll(/https?:\/\/[^\s<>"\u201c\u201d]+/gi)){
    let value=match[0],previous;
    do{
      previous=value;value=value.replace(/[.,!?:;\u2026\u2019'`]+$/u,'');
      for(const [open,close] of [['(',')'],['[',']'],['{','}']])while(value.endsWith(close)&&value.split(close).length>value.split(open).length)value=value.slice(0,-1);
    }while(value!==previous);
    try{const url=linkURL(value);if(!links.includes(url))links.push(url);}catch{/* Invalid and oversized URLs remain ordinary text. */}
  }
  return links;
}
export function resolveLinks(text,manual,existing,suppressed,available) {
  const used=new Set(existing.map(value=>{try{return linkURL(value);}catch{return value;}}));
  const attached=[...new Set(manual)].filter(url=>!used.has(url));
  const candidates=textLinks(text).filter(url=>!used.has(url)&&!attached.includes(url)&&!suppressed.includes(url));
  const automatic=candidates.slice(0,Math.max(0,available-attached.length));
  return {urls:[...attached,...automatic],overflow:candidates.length-automatic.length};
}
