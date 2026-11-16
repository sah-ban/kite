import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Platform,Pressable,Text,View,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {Image} from 'expo-image';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {router,Tabs} from 'expo-router';
import {mergeCasts} from '../../lib/model';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Icon} from '../../components/ui';
import {AccountButton} from '../../components/AccountButton';
import {initialScrollHeader,scrollHeader} from '../../lib/scroll-header';

export default function Home(){
  const {api,colors,published,account}=useApp();
  const insets=useSafeAreaInsets(),scroll=useRef(initialScrollHeader);
  const [hidden,setHidden]=useState(false),[headerY]=useState(()=>new Animated.Value(0));
  useEffect(()=>{
    const animation=Animated.timing(headerY,{toValue:hidden?-56:0,duration:180,useNativeDriver:Platform.OS!=='web'});animation.start();
    return()=>animation.stop();
  },[hidden,headerY]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
    const offset=Math.max(0,Math.min(contentOffset.y,Math.max(0,contentSize.height-layoutMeasurement.height)));
    const next=scrollHeader(scroll.current,offset);
    if(next.hidden!==scroll.current.hidden)setHidden(next.hidden);
    scroll.current=next;
  },[]);
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  const feed={...page,items:mergeCasts(published.filter(cast=>!cast.data.castAddBody.parentCastId),page.items).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.surface}}>
    <Tabs.Screen options={{headerShown:false}}/>
    <View style={{flex:1,overflow:'hidden'}}>
    <CastList page={feed} autoLoadMore onScroll={onScroll} contentTopInset={56}/>
    <Animated.View testID="home-header" pointerEvents={hidden?'none':'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden?'no-hide-descendants':'auto'} style={{position:'absolute',top:0,left:0,right:0,height:56,zIndex:20,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-between',transform:[{translateY:headerY}]}}>
      <AccountButton side="left"/>
      <View pointerEvents="none" style={{position:'absolute',left:70,right:70,top:0,bottom:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}><Image source={require('../../../assets/kite-mark.png')} style={{width:25,height:25}} contentFit="contain"/><Text style={{color:colors.ink,fontSize:22,fontWeight:'700',letterSpacing:-.6}}>Kite</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh feed" accessibilityState={{disabled:page.loading,busy:page.refreshing}} disabled={page.loading} onPress={page.refresh} style={({pressed})=>({width:44,height:44,marginRight:12,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent',opacity:page.loading&&!page.refreshing?.4:1})}>
        {page.refreshing?<ActivityIndicator size="small" color={colors.accent}/>:<Icon name="refresh-cw" size={18} color={colors.muted}/>}
      </Pressable>
    </Animated.View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="New cast" onPress={()=>router.push(account.session?'/compose':'/sign-in')} style={({pressed})=>({position:'absolute',right:18,bottom:24,width:56,height:56,borderRadius:19,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',elevation:4,opacity:pressed?.8:1})}><Icon name="edit-3" size={24} color={colors.background}/></Pressable>
  </View>;
}
