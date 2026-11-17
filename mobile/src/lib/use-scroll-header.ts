import {useCallback,useEffect,useRef,useState} from 'react';
import {Animated,Platform,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {initialScrollHeader,scrollHeader,SCROLL_HEADER_HEIGHT} from './scroll-header';

export function useScrollHeader(height=SCROLL_HEADER_HEIGHT){
  const scroll=useRef(initialScrollHeader);
  const [hidden,setHidden]=useState(false),[headerY]=useState(()=>new Animated.Value(0));
  useEffect(()=>{
    const animation=Animated.timing(headerY,{toValue:hidden?-height:0,duration:180,useNativeDriver:Platform.OS!=='web'});animation.start();
    return()=>animation.stop();
  },[hidden,headerY,height]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
    const offset=Math.max(0,Math.min(contentOffset.y,Math.max(0,contentSize.height-layoutMeasurement.height)));
    const next=scrollHeader(scroll.current,offset,height);
    if(next.hidden!==scroll.current.hidden)setHidden(next.hidden);
    scroll.current=next;
  },[height]);
  return {hidden,headerY,onScroll,isAtTop:()=>scroll.current.offset<=4};
}
