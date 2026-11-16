import {useCallback,useEffect,useRef,useState} from 'react';
import {Animated,Platform,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {initialScrollHeader,scrollHeader,SCROLL_HEADER_HEIGHT} from './scroll-header';

export function useScrollHeader(){
  const scroll=useRef(initialScrollHeader);
  const [hidden,setHidden]=useState(false),[headerY]=useState(()=>new Animated.Value(0));
  useEffect(()=>{
    const animation=Animated.timing(headerY,{toValue:hidden?-SCROLL_HEADER_HEIGHT:0,duration:180,useNativeDriver:Platform.OS!=='web'});animation.start();
    return()=>animation.stop();
  },[hidden,headerY]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
    const offset=Math.max(0,Math.min(contentOffset.y,Math.max(0,contentSize.height-layoutMeasurement.height)));
    const next=scrollHeader(scroll.current,offset);
    if(next.hidden!==scroll.current.hidden)setHidden(next.hidden);
    scroll.current=next;
  },[]);
  return {hidden,headerY,onScroll};
}
