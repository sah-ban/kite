import { RefreshCw } from 'lucide-react';
import { FeedSkeleton } from './FeedSkeleton';
import { KiteMark } from './KiteMark';
import { ThemeToggle } from './ThemeToggle';

export function AppLoading({error,onRetry,onGuide}:{error:string;onRetry:()=>void;onGuide:()=>void}) {
  return <main className="app-startup" aria-label="Opening Kite">
    <div className="startup-theme"><ThemeToggle/></div>
    <div className="startup-content">
      <div className="startup-brand"><KiteMark transparent/><span>kite</span></div>
      {error?<>
        <div className="startup-error" role="alert"><h1>Couldn’t open Kite</h1><p>{error}</p></div>
        <div className="startup-actions"><button className="button primary" onClick={onRetry}><RefreshCw size={16}/>Try again</button><a className="button" href="/guide" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onGuide();}}>Open guide</a></div>
      </>:<>
        <p className="startup-status" role="status">Getting things ready…</p>
        <div className="startup-progress" aria-hidden="true"/>
        <div className="startup-preview" aria-hidden="true"><FeedSkeleton count={2}/></div>
      </>}
    </div>
  </main>;
}
