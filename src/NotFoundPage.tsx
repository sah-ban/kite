import {ArrowLeft,Search} from 'lucide-react';
export function NotFoundPage({onHome,onSearch}:{onHome:()=>void;onSearch:()=>void}){
  return <section className="not-found-page" aria-labelledby="not-found-heading">
    <div className="not-found-code" aria-hidden="true">404</div>
    <h1 id="not-found-heading">Page not found</h1>
    <p>Check the link, or head back to your feed.</p>
    <div className="not-found-actions">
      <a className="button primary" href="/" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onHome();}}><ArrowLeft size={17}/>Back to Home</a>
      <a className="button" href="/search" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onSearch();}}><Search size={17}/>Search</a>
    </div>
  </section>;
}
