import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfig, type Config } from './lib/hub';
import { Guide } from './Guide';
import './style.css';
import './client-ui.css';
import { AppHeader } from './AppHeader';
import { AppLoading } from './AppLoading';
import { PageMetadata } from './PageMetadata';
import {isGuidePath} from './lib/routes';
const Client = lazy(()=>import('./Client').then(m=>({default:m.Client})));
const currentPage = ():'guide'|'client' => isGuidePath(location.pathname) ? 'guide' : 'client';
function App(){
  const [page,setPage]=useState(currentPage),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    getConfig(AbortSignal.any([controller.signal,AbortSignal.timeout(15_000)])).then(value=>{if(!controller.signal.aborted)setConfig(value);}).catch(error=>{if(!controller.signal.aborted)setError(error.name==='TimeoutError'?'The connection is taking too long. Please try again.':error.message||'Check your connection and try again.');});
    return()=>controller.abort();
  },[attempt]);
  useEffect(()=>{
    if(/^\/client\/?$/.test(location.pathname))history.replaceState({},'',`/${location.search}${location.hash}`);
    const pop=()=>setPage(currentPage());window.addEventListener('popstate',pop);
    return()=>window.removeEventListener('popstate',pop);
  },[]);
  function navigate(p:'client'|'guide'){
    history.pushState({kite:true},'',p==='client'?'/':'/guide');setPage(p);
    window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo(0,0);
  }
  const loading=<AppLoading error={error} onRetry={()=>setAttempt(value=>value+1)} onGuide={()=>navigate('guide')}/>;
  return <><PageMetadata page={page}/>{page==='guide'?<><AppHeader onHome={()=>navigate('client')}/><Guide openClient={()=>navigate('client')}/></>:config?<Suspense fallback={loading}><Client config={config} openGuide={()=>navigate('guide')}/></Suspense>:loading}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
