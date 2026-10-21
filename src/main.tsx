import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfig, type Config } from './lib/hub';
import { Guide } from './Guide';
import './style.css';
import './client-ui.css';
import { AppHeader } from './AppHeader';
import {isGuidePath} from './lib/routes';
const Client = lazy(()=>import('./Client').then(m=>({default:m.Client})));
const currentPage = () => isGuidePath(location.pathname) ? 'guide' : 'client';
function App(){
  const [page,setPage]=useState(currentPage),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(/^\/client\/?$/.test(location.pathname))history.replaceState({},'',`/${location.search}${location.hash}`);
    getConfig().then(setConfig).catch(e=>setError(e.message));
    const pop=()=>setPage(currentPage());window.addEventListener('popstate',pop);
    return()=>window.removeEventListener('popstate',pop);
  },[]);
  function navigate(p:'client'|'guide'){
    history.pushState({kite:true},'',p==='client'?'/':'/guide');setPage(p);
    window.dispatchEvent(new PopStateEvent('popstate'));window.scrollTo(0,0);
  }
  const loading=<><AppHeader onHome={()=>navigate('client')} desktopHidden/><main className="loading"><p>{error||'Opening Kite…'}</p></main></>;
  return page==='guide'?<><AppHeader onHome={()=>navigate('client')}/><Guide openClient={()=>navigate('client')}/></>:config?<Suspense fallback={loading}><Client config={config} openGuide={()=>navigate('guide')}/></Suspense>:loading;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
