import {useSyncExternalStore} from 'react';
import {castDate} from './lib/hub';
import {fullCastTime,relativeCastTime} from './lib/time';

let now=Date.now();
const listeners=new Set<()=>void>();
let timer:ReturnType<typeof setInterval>|undefined;
function subscribe(listener:()=>void){
  listeners.add(listener);
  if(!timer){now=Date.now();timer=setInterval(()=>{now=Date.now();for(const update of listeners)update();},60_000);}
  return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined;}};
}
const snapshot=()=>now;
const noSubscription=()=>()=>{};

export function CastTime({timestamp,full=false}:{timestamp:number;full?:boolean}){
  const current=useSyncExternalStore(full?noSubscription:subscribe,snapshot,snapshot);
  const absolute=fullCastTime(timestamp);
  return <time dateTime={castDate(timestamp).toISOString()} title={absolute}>{full?absolute:relativeCastTime(timestamp,current)}</time>;
}
