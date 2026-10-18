import { useSyncExternalStore } from 'react';
export type ThemePreference='system'|'light'|'dark';
type Theme='light'|'dark';
const storageKey='freecast-theme';
const system=window.matchMedia('(prefers-color-scheme: dark)');
function savedPreference():ThemePreference {try{const value=localStorage.getItem(storageKey);return value==='light'||value==='dark'?value:'system';}catch{return 'system';}}
let preference=savedPreference();
let snapshot={preference,theme:(preference==='system'?(system.matches?'dark':'light'):preference) as Theme};
const listeners=new Set<()=>void>();
function sync(){
  const theme=preference==='system'?(system.matches?'dark':'light'):preference;
  document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#141b18':'#f7f8f3');
  if(snapshot.preference!==preference||snapshot.theme!==theme){snapshot={preference,theme};for(const listener of listeners)listener();}
}
function storage(event:StorageEvent){if(event.key===storageKey||event.key===null){preference=savedPreference();sync();}}
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(listeners.size===1){system.addEventListener('change',sync);window.addEventListener('storage',storage);sync();}
  return()=>{listeners.delete(listener);if(!listeners.size){system.removeEventListener('change',sync);window.removeEventListener('storage',storage);}};
}
export function setThemePreference(value:ThemePreference){
  preference=value;try{if(value==='system')localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,value);}catch{}
  sync();
}
export function useTheme(){return useSyncExternalStore(subscribe,()=>snapshot,()=>snapshot);}
sync();
