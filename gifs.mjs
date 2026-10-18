const mediaUrl=value=>{
  try{const url=new URL(value);return url.protocol==='https:'&&/^media(?:\d+)?\.tenor\.com$/.test(url.hostname)&&url.pathname.endsWith('.gif')&&!url.port&&!url.username&&!url.password&&Buffer.byteLength(url.href)<=256?url.href:undefined;}catch{return undefined;}
};
export function gifSearch(dependencies={}) {
  const send=dependencies.fetch||fetch,cache=new Map(),now=dependencies.now||Date.now;
  return async(req,res,next)=>{
    const url=new URL(req.url||'/','http://localhost');if(url.pathname!=='/api/gifs')return next();
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='GET')return reply(405,{error:'Use GET to find GIFs.'});
    const query=(url.searchParams.get('q')||'').trim(),pos=url.searchParams.get('pos')||'';
    if(query.length>100||pos.length>512)return reply(400,{error:'GIF search is too long.'});
    const target=new URL(`https://tenor.bhopp.ing/v2/${query?'search':'featured'}`);
    target.search=new URLSearchParams({limit:'20',media_filter:'gif,tinygif',contentfilter:'medium',client_key:'freecast',...(query?{q:query}:{}),...(pos?{pos}: {})}).toString();
    const key=target.href,cached=cache.get(key);if(cached&&cached.expires>now())return reply(200,cached.body);
    try{
      const response=await send(target,{signal:AbortSignal.timeout(12_000),redirect:'error'});
      if(!response.ok)throw new Error('Provider unavailable');const data=await response.json();
      if(!Array.isArray(data.results))throw new Error('Invalid GIF results');
      const seen=new Set(),items=[];
      for(const item of data.results.slice(0,20)){
        const url=mediaUrl(item.media_formats?.gif?.url),preview=mediaUrl(item.media_formats?.tinygif?.url)||url;
        if(!url||typeof item.id!=='string'||!item.id||seen.has(item.id))continue;seen.add(item.id);
        items.push({id:item.id,url,preview,title:typeof item.content_description==='string'?item.content_description.slice(0,150):'GIF'});
      }
      const body={items,next:typeof data.next==='string'&&data.next!=='0'&&data.next!==pos&&data.next.length<=512?data.next:''};
      if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{expires:now()+30_000,body});reply(200,body);
    }catch{return reply(502,{error:'Could not load GIFs. Please try again.'});}
  };
}
