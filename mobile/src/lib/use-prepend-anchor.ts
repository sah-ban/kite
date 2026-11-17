import {useRef} from 'react';
import type {LayoutChangeEvent,NativeScrollEvent,NativeSyntheticEvent} from 'react-native';

// Preserve the viewed cast when earlier context changes height above it.
export function usePrependAnchor(scrollTo:(offset:number)=>void,onNearTop?:()=>void){
  const offset=useRef(0),height=useRef(0);
  function onScroll(event:NativeSyntheticEvent<NativeScrollEvent>){
    const next=Math.max(0,event.nativeEvent.contentOffset.y),previous=offset.current;offset.current=next;
    if(next<100&&next<previous-1)onNearTop?.();
  }
  function onLayout(event:LayoutChangeEvent){
    const next=event.nativeEvent.layout.height,delta=next-height.current;height.current=next;
    if(Math.abs(delta)<.5)return;
    offset.current=Math.max(0,offset.current+delta);scrollTo(offset.current);
  }
  return {onScroll,onLayout};
}
