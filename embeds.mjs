import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Parser } from 'htmlparser2';

const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
const globalIPv6=new BlockList();globalIPv6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])blocked.addSubnet(address,prefix,'ipv6');
export function isPublicAddress(address) {
  const family=isIP(address);
  return family===4?!blocked.check(address,'ipv4'):family===6&&globalIPv6.check(address,'ipv6')&&!blocked.check(address,'ipv6');
}
function urlFor(input) {
  const url=new URL(input);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>4096||(url.port&&!['80','443'].includes(url.port)))throw new Error('Unsupported URL.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||/\.(localhost|local|internal|invalid|test)$/.test(host))throw new Error('Private destination.');
  url.hash='';return url;
}
async function before(promise,deadline) {
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Preview timed out.')),Math.max(1,deadline-Date.now()));})]);}
  finally{clearTimeout(timer);}
}
export async function publicDestination(input,resolve=lookup,deadline=Date.now()+12_000) {
  const url=urlFor(input),host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await before(resolve(host,{all:true,verbatim:true}),deadline);
  if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address)))throw new Error('Private destination.');
  return {url,address:addresses[0]};
}
const mediaKind=type=>/^image\/(?!svg)/i.test(type)?'image':/^video\//i.test(type)||/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(type)?'video':undefined;

export async function loadDocument(input,dependencies={},redirects=0,deadline=Date.now()+12_000) {
  const {url,address}=await publicDestination(input,dependencies.lookup||lookup,deadline);
  const send=dependencies.request||(url.protocol==='https:'?httpsRequest:httpRequest);
  const data=await new Promise((resolve,reject)=>{
    let timer,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const req=send(url,{
      method:'GET',headers:{Accept:'text/html,application/xhtml+xml,image/*,video/*,application/vnd.apple.mpegurl;q=0.8','Accept-Encoding':'identity','User-Agent':'Freecast-LinkPreview/1.0'},
      // Pin the validated DNS answer so the connection cannot resolve a private address later.
      lookup:(_host,options,callback)=>options?.all?callback(null,[address]):callback(null,address.address,address.family),
      agent:false,
    },response=>{
      const status=response.statusCode||0,type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      if([301,302,303,307,308].includes(status)){
        const location=response.headers.location;finish(null,{redirect:location});response.destroy();return;
      }
      if(status!==200){finish(new Error('Preview origin unavailable.'));response.destroy();return;}
      const kind=mediaKind(type);
      if(kind){finish(null,{kind,type,body:''});response.destroy();return;}
      if(!['text/html','application/xhtml+xml'].includes(type)||!['','identity'].includes(String(response.headers['content-encoding']||''))){finish(null,{kind:'link',type,body:''});response.destroy();return;}
      const chunks=[];let size=0,tail='';
      response.on('data',chunk=>{
        size+=chunk.length;
        if(size>512*1024){finish(new Error('Preview document too large.'));response.destroy();return;}
        chunks.push(chunk);
        // Metadata is in the head; stop downloading before the page body and scripts.
        const marker=tail+chunk.toString('utf8').toLowerCase();tail=marker.slice(-7);
        if(marker.includes('</head>')){finish(null,{kind:'link',type,body:Buffer.concat(chunks).toString('utf8')});response.destroy();}
      });
      response.on('end',()=>finish(null,{kind:'link',type,body:Buffer.concat(chunks).toString('utf8')}));
      response.on('error',error=>finish(error));
      response.on('aborted',()=>finish(new Error('Preview interrupted.')));
    });
    timer=setTimeout(()=>{finish(new Error('Preview timed out.'));req.destroy();},Math.max(1,deadline-Date.now()));
    req.on('error',error=>finish(error));req.end();
  });
  if('redirect' in data){
    if(!data.redirect||redirects>=3)throw new Error('Too many preview redirects.');
    return loadDocument(new URL(data.redirect,url).href,dependencies,redirects+1,deadline);
  }
  return {...data,url:url.href};
}

export function parseMetadata(html,base) {
  const values=new Map();let inTitle=false,title='';
  const parser=new Parser({
    onopentag(name,attrs){
      if(name==='title')inTitle=true;
      if(name==='meta'){
        const key=(attrs.property||attrs.name||'').toLowerCase();
        if(key&&attrs.content&&!values.has(key))values.set(key,attrs.content);
      }
    },
    ontext(text){if(inTitle&&title.length<1000)title+=text;},
    onclosetag(name){if(name==='title')inTitle=false;},
  },{decodeEntities:true});
  parser.end(html);
  const text=(value,max)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
  const asset=value=>{if(typeof value!=='string'||!value.trim())return undefined;try{return urlFor(new URL(value,base).href).href;}catch{return undefined;}};
  const video=values.get('og:video:secure_url')||values.get('og:video:url')||values.get('og:video');
  const type=text(values.get('og:video:type'),100);
  return {
    title:text(values.get('og:title')||values.get('twitter:title')||title,200),
    description:text(values.get('og:description')||values.get('twitter:description')||values.get('description'),350),
    site:text(values.get('og:site_name')||new URL(base).hostname,100),
    image:asset(values.get('og:image:secure_url')||values.get('og:image')||values.get('twitter:image')),
    video:video&&(mediaKind(type)==='video'||/\.(mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(video))?asset(video):undefined,
    videoType:type,
  };
}

export function embedPreviews(dependencies={}) {
  const cache=new Map(),rates=new Map();let active=0;
  return async(req,res,next)=>{
    const path=new URL(req.url||'/','http://localhost');if(path.pathname!=='/api/embed')return next();
    const respond=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control',status===200?'public, max-age=60':'no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));};
    if(req.method!=='GET')return respond(405,{error:'Method not allowed.'});
    let url;
    try{url=urlFor(path.searchParams.get('url')).href;}catch{return respond(400,{error:'Invalid preview URL.'});}
    const now=Date.now();for(const [key,item] of cache)if(item.expires<=now)cache.delete(key);
    for(const [key,item] of rates)if(item.expires<=now)rates.delete(key);
    const existing=cache.get(url);
    if(existing){try{return respond(200,await existing.value);}catch{return respond(502,{error:'Preview unavailable.'});}}
    const ip=req.socket?.remoteAddress||'unknown',rate=rates.get(ip)||{count:0,expires:now+60_000};
    if(active>=8||rate.count>=90||rates.size>=2000)return respond(429,{error:'Try this preview later.'});
    rate.count++;rates.set(ip,rate);active++;
    const value=(async()=>{
      const deadline=Date.now()+12_000;
      const data=await loadDocument(url,dependencies,0,deadline);
      if(data.kind!=='link')return {kind:data.kind,url:data.url,contentType:data.type};
      const meta=parseMetadata(data.body,data.url);
      await Promise.all(['image','video'].map(async key=>{if(meta[key]){try{await publicDestination(meta[key],dependencies.lookup||lookup,deadline);}catch{delete meta[key];}}}));
      return {kind:meta.video?'video':'link',url:data.url,...meta,...(meta.video?{url:meta.video,poster:meta.image,contentType:meta.videoType}:{}),sourceUrl:data.url};
    })().finally(()=>{active--;});
    cache.set(url,{expires:now+5*60_000,value});if(cache.size>500)cache.delete(cache.keys().next().value);
    try{return respond(200,await value);}catch{cache.delete(url);return respond(502,{error:'Preview unavailable.'});}
  };
}
