import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const storageKey = 'freecast-theme';
function savedTheme(): Theme | undefined {
  try { const value=localStorage.getItem(storageKey); return value==='light'||value==='dark'?value:undefined; }
  catch { return undefined; }
}
function applyTheme(theme:Theme) {
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#141b18':'#f7f8f3');
}
export function ThemeToggle() {
  const [theme,setTheme]=useState<Theme>(document.documentElement.dataset.theme==='dark'?'dark':'light');
  const preference=useRef(savedTheme());
  useEffect(()=>{
    const system=window.matchMedia('(prefers-color-scheme: dark)');
    const sync=()=>{const next=preference.current||(system.matches?'dark':'light');applyTheme(next);setTheme(next);};
    const storage=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null){preference.current=savedTheme();sync();}};
    sync();system.addEventListener('change',sync);window.addEventListener('storage',storage);
    return()=>{system.removeEventListener('change',sync);window.removeEventListener('storage',storage);};
  },[]);
  const label=theme==='dark'?'Switch to light theme':'Switch to dark theme';
  return <button className="icon-button theme-toggle" aria-label={label} title={label} aria-pressed={theme==='dark'} onClick={()=>{
    const next=theme==='dark'?'light':'dark';preference.current=next;
    try { localStorage.setItem(storageKey,next); } catch {}
    applyTheme(next);setTheme(next);
  }}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
