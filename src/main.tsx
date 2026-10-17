import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, BookOpen, Radio } from 'lucide-react';
import { getConfig, type Config } from './lib/hub';
import { Guide } from './Guide';
import './style.css';
const Client = lazy(()=>import('./Client').then(m=>({default:m.Client})));
function App(){
  const [page,setPage]=useState(location.pathname.startsWith('/client')?'client':'guide'),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');
  useEffect(()=>{getConfig().then(setConfig).catch(e=>setError(e.message));const pop=()=>setPage(location.pathname.startsWith('/client')?'client':'guide');window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  function navigate(p:'client'|'guide'){setPage(p);history.pushState({},'',p==='client'?'/client':'/');window.scrollTo(0,0);}
  return <><header className="site-header"><a className="brand" href="/" onClick={e=>{e.preventDefault();navigate('guide');}}><span className="brand-icon">f</span>freecast<span className="brand-dot">.</span></a><nav aria-label="Main navigation"><a className={page==='guide'?'nav-active':''} href="/" onClick={e=>{e.preventDefault();navigate('guide');}}><BookOpen size={15}/>The field guide</a><a className={page==='client'?'nav-active':''} href="/client" onClick={e=>{e.preventDefault();navigate('client');}}><Radio size={15}/>The client</a></nav><a className="header-link" href="https://github.com/farcasterxyz/snapchain" target="_blank" rel="noreferrer">The protocol <ArrowUpRight size={15}/></a></header>{page==='guide'?<Guide openClient={()=>navigate('client')}/>:config?<Suspense fallback={<main className="loading"><p>Opening the client…</p></main>}><Client config={config} openGuide={()=>navigate('guide')}/></Suspense>:<main className="loading"><p>{error||'Connecting to your node…'}</p></main>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
