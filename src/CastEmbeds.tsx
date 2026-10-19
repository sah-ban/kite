import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ImageOff, Link2, Play } from 'lucide-react';
import { classifyEmbed, embedPreview, embedURL, type EmbedInfo } from './lib/embeds';
import { Modal } from './components';

function ImageEmbed({url,title}:{url:string;title?:string}) {
  const [failed,setFailed]=useState(false),[open,setOpen]=useState(false);
  useEffect(()=>{setFailed(false);setOpen(false);},[url]);
  return failed?<a className="media-fallback" href={url} target="_blank" rel="noreferrer"><ImageOff size={18}/>Image unavailable · Open original <ArrowUpRight size={13}/></a>:<>
    <button type="button" className="image-embed" aria-label="Enlarge cast image" onClick={()=>setOpen(true)}><img src={url} alt={title||'Image attached to cast'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/><span>Enlarge ↗</span></button>
    {open&&<Modal title="Cast image" className="image-viewer" onClose={()=>setOpen(false)}><img className="enlarged-image" src={url} alt={title||'Image attached to cast'} referrerPolicy="no-referrer"/><a className="text-button" href={url} target="_blank" rel="noreferrer">Open original image <ArrowUpRight size={13}/></a></Modal>}
  </>;
}
function VideoEmbed({url,poster,contentType}:{url:string;poster?:string;contentType?:string}) {
  const [started,setStarted]=useState(false),[failed,setFailed]=useState(false);
  const player=useRef<HTMLVideoElement>(null);
  useEffect(()=>{setStarted(false);setFailed(false);},[url]);
  useEffect(()=>{
    if(!started||!player.current)return;
    const video=player.current;let active=true,hls:{destroy:()=>void}|undefined;
    (async()=>{
      const isHLS=/\.m3u8(?:[?#]|$)/i.test(url)||/mpegurl/i.test(contentType||'');
      if(isHLS&&!video.canPlayType('application/vnd.apple.mpegurl')){
        const {default:Hls}=await import('hls.js');if(!active)return;
        if(!Hls.isSupported()){setFailed(true);return;}
        const instance=new Hls({maxBufferLength:20,maxMaxBufferLength:30,manifestLoadingTimeOut:10_000,fragLoadingTimeOut:10_000});hls=instance;
        instance.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal&&active){setFailed(true);instance.destroy();}});
        instance.on(Hls.Events.MANIFEST_PARSED,()=>{if(active)void video.play().catch(()=>{});});
        instance.loadSource(url);instance.attachMedia(video);
      }else{video.src=url;void video.play().catch(()=>{});}
    })().catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;hls?.destroy();video.pause();video.removeAttribute('src');video.load();};
  },[started,url,contentType]);
  return <div className="video-embed">
    {failed?<a className="media-fallback" href={url} target="_blank" rel="noreferrer">Video unavailable here · Open original <ArrowUpRight size={13}/></a>:started?<video ref={player} controls playsInline preload="none" poster={poster} aria-label="Cast video" onError={()=>setFailed(true)} onPlay={event=>{document.querySelectorAll('video').forEach(video=>{if(video!==event.currentTarget)video.pause();});}}/>:<button type="button" className="video-cover" onClick={()=>setStarted(true)} aria-label="Play cast video">{poster&&<img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}<span><Play size={26}/>Play video</span></button>}
    {!failed&&<a className="media-original" href={url} target="_blank" rel="noreferrer">Open original video <ArrowUpRight size={11}/></a>}
  </div>;
}
function HostedVideo({kind,id,url}:{kind:'youtube'|'vimeo';id:string;url:string}) {
  const [started,setStarted]=useState(false);
  const name=kind==='youtube'?'YouTube':'Vimeo';
  const source=kind==='youtube'?`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`:`https://player.vimeo.com/video/${id}?autoplay=1`;
  return <div className="hosted-video">{started?<iframe src={source} title={`${name} video`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"/>:<button type="button" className="video-cover" aria-label={`Play ${name} video`} onClick={()=>setStarted(true)}>{kind==='youtube'&&<img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}<span><Play size={26}/>Play on {name}</span></button>}<a className="media-original" href={url} target="_blank" rel="noreferrer">Open on {name} <ArrowUpRight size={11}/></a></div>;
}
function LinkCard({url,info}:{url:string;info?:EmbedInfo}) {
  const [imageFailed,setImageFailed]=useState(false);
  useEffect(()=>setImageFailed(false),[info?.image]);
  const host=new URL(url).hostname.replace(/^www\./,'');
  return <a className="link-preview" href={url} target="_blank" rel="noreferrer">
    {info?.image&&embedURL(info.image)&&!imageFailed&&<img className="link-preview-image" src={info.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setImageFailed(true)}/>}
    <span className="link-preview-body"><span className="link-site"><Link2 size={12}/>{info?.site||host}<ArrowUpRight size={12}/></span><strong>{info?.title||host}</strong>{info?.description&&<span className="link-description">{info.description}</span>}<span className="link-address">{url}</span></span>
  </a>;
}
function Embed({url,visible}:{url:string;visible:boolean}) {
  const kind=classifyEmbed(url)!;
  const [info,setInfo]=useState<EmbedInfo>();
  useEffect(()=>{let active=true;setInfo(undefined);if(visible&&kind.kind==='link')embedPreview(url).then(value=>{if(active)setInfo(value);}).catch(()=>{});return()=>{active=false;};},[url,visible,kind.kind]);
  if(!visible)return <a className="embed-placeholder" href={url} target="_blank" rel="noreferrer">{new URL(url).hostname} <ArrowUpRight size={12}/></a>;
  if(kind.kind==='youtube'||kind.kind==='vimeo')return <HostedVideo kind={kind.kind} id={kind.id!} url={url}/>;
  const type=kind.kind==='link'?info?.kind:kind.kind,source=info?.url||url;
  if(type==='image')return <ImageEmbed url={source} title={info?.title}/>;
  if(type==='video')return <VideoEmbed url={source} poster={info?.poster||info?.image} contentType={info?.contentType}/>;
  return <LinkCard url={url} info={info}/>;
}
export function CastEmbeds({urls,visible,compact=false}:{urls:string[];visible:boolean;compact?:boolean}) {
  const sources=[...new Set(urls.map(embedURL).filter((url):url is string=>Boolean(url)))];
  return sources.length?<div className={`cast-embeds${compact?' compact-embeds':''}`}>{sources.map(url=><Embed key={url} url={url} visible={visible}/>)}</div>:null;
}
