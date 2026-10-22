import {ArrowUpRight,BookOpen,Github,MessageSquareQuote} from 'lucide-react';
import {KiteMark} from './KiteMark';

export function AboutKite({onGuide}:{onGuide:()=>void}){
  return <aside className="client-about-sidebar" aria-labelledby="about-kite-heading">
    <section className="about-kite-card">
      <div className="about-kite-brand"><KiteMark/><h2 id="about-kite-heading">About Kite</h2></div>
      <p className="about-kite-description">An open source Farcaster client with chronological feeds, client filters, and richer conversations.</p>
      <div className="about-kite-links">
        <a href="https://github.com/sah-ban/kite" target="_blank" rel="noopener noreferrer"><Github size={17}/><span>Source code</span><ArrowUpRight size={15}/></a>
        <a href="/guide" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onGuide();}}><BookOpen size={17}/><span>Field guide</span><ArrowUpRight size={15}/></a>
        <a href="/endorsements"><MessageSquareQuote size={17}/><span>Endorsements</span><ArrowUpRight size={15}/></a>
      </div>
    </section>
  </aside>;
}
