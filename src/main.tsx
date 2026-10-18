import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, BookOpen, Radio } from 'lucide-react';
import { getConfig, type Config } from './lib/hub';
import { Guide } from './Guide';
import { ThemeToggle } from './ThemeToggle';
import './style.css';
const Client = lazy(()=>import('./Client').then(m=>({default:m.Client})));
const currentPage = () => location.pathname==='/guide'||location.pathname.startsWith('/guide/') ? 'guide' : 'client';
function App(){
  const [page,setPage]=useState(currentPage),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(/^\/client\/?$/.test(location.pathname))history.replaceState({},'',`/${location.search}${location.hash}`);
    getConfig().then(setConfig).catch(e=>setError(e.message));
    const pop=()=>setPage(currentPage());window.addEventListener('popstate',pop);
    return()=>window.removeEventListener('popstate',pop);
  },[]);
  function navigate(p:'client'|'guide'){
    history.pushState({freecast:true},'',p==='client'?'/':'/guide');setPage(p);
    window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo(0,0);
  }
  return <><header className="site-header"><a className="brand" href="/" onClick={e=>{e.preventDefault();navigate('client');}}><span className="brand-icon">f</span>freecast<span className="brand-dot">.</span></a><nav aria-label="Main navigation"><a className={page==='client'?'nav-active':''} href="/" onClick={e=>{e.preventDefault();navigate('client');}}><Radio size={15}/>The client</a><a className={page==='guide'?'nav-active':''} href="/guide" onClick={e=>{e.preventDefault();navigate('guide');}}><BookOpen size={15}/>The field guide</a></nav><div className="header-actions"><a className="header-link" href="https://github.com/farcasterxyz/snapchain" target="_blank" rel="noreferrer">The protocol <ArrowUpRight size={15}/></a><ThemeToggle/></div></header>{page==='guide'?<Guide openClient={()=>navigate('client')}/>:config?<Suspense fallback={<main className="loading"><p>Opening the client…</p></main>}><Client config={config} openGuide={()=>navigate('guide')}/></Suspense>:<main className="loading"><p>{error||'Connecting to your node…'}</p></main>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
