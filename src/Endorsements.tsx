import {ArrowRight,ArrowUpRight,BookOpen,Github,MessageSquareQuote} from 'lucide-react';
import type {Config} from './lib/hub';
import {endorsements} from './lib/endorsements';
import {QuotedCast} from './QuotedCast';

export function Endorsements({config,error,onRetry,onGuide}:{config:Config|null;error:string;onRetry:()=>void;onGuide:()=>void}){
  return <main className="endorsements-page">
    <section className="endorsements-heading" aria-labelledby="endorsements-title">
      <span className="eyebrow">FROM THE COMMUNITY</span>
      <h1 id="endorsements-title">Endorsements</h1>
      <p>Public casts from people who have tried Kite. Read their feedback in their own words.</p>
      <div className="endorsements-resources">
        <a className="button" href="/guide" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onGuide();}}><BookOpen size={17}/>Read the guide <ArrowRight size={16}/></a>
        <a className="button" href="https://github.com/sah-ban/kite" target="_blank" rel="noopener noreferrer"><Github size={17}/>GitHub <ArrowUpRight size={16}/></a>
      </div>
    </section>
    {!endorsements.length?<section className="endorsements-empty" aria-label="No endorsements yet"><MessageSquareQuote size={30} aria-hidden="true"/><h2>No endorsements added yet</h2><p>Public tester casts will appear here when available.</p></section>:<section className="endorsements-list" aria-label="Tester endorsements">
      {error&&!config&&<div className="endorsements-error" role="alert"><p>Cast previews couldn’t load. You can still read the originals on Farcaster.</p><button className="button" onClick={onRetry}>Try again</button></div>}
      {endorsements.map(({fid,hash})=><article className="endorsement-card" key={`${fid}:${hash}`}>
        {config?<QuotedCast config={config} fid={fid} hash={hash} visible onOpen={()=>{location.assign(`/cast/${fid}/${hash}`);}} onProfile={profileFid=>{location.assign(`/profile/${profileFid}`);}}/>:!error?<p className="muted" role="status">Loading cast preview…</p>:null}
        <div className="endorsement-links"><a href={`/cast/${fid}/${hash}`}>Open in Kite <ArrowRight size={14}/></a><a href={`https://farcaster.xyz/~/conversations/${hash}`} target="_blank" rel="noopener noreferrer">Original on Farcaster <ArrowUpRight size={14}/></a></div>
      </article>)}
    </section>}
  </main>;
}
