import {useRef,useState} from 'react';
import {Animated,FlatList,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Tabs} from 'expo-router';
import {type Cast,mergeCasts} from '../../lib/model';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {ScrollHeader} from '../../components/ScrollHeader';
import {useScrollHeader} from '../../lib/use-scroll-header';
import {SCROLL_HEADER_HEIGHT} from '../../lib/scroll-header';
import {useNotifications} from '../../lib/notification-state';
import {HapticPressable as Pressable} from '../../components/HapticControls';

type HomeFeed='following'|'all';
const FEED_TABS_HEIGHT=44;

export default function Home(){
  const {api,colors,account}=useApp(),insets=useSafeAreaInsets(),fid=account.session?.fid;
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.surface}}>
    <Tabs.Screen options={{headerShown:false}}/>
    <HomeContent key={`${api.origin}:${fid||0}`} fid={fid}/>
  </View>;
}
function HomeContent({fid}:{fid?:number}){
  const [tab,setTab]=useState<HomeFeed>(fid?'following':'all'),setup=useNotifications();
  return <Timeline key={`${tab}:${tab==='following'?setup.mode:'public'}`} fid={fid} tab={tab} onTab={setTab} setup={setup}/>;
}
function Timeline({fid,tab,onTab,setup}:{fid?:number;tab:HomeFeed;onTab:(value:HomeFeed)=>void;setup:ReturnType<typeof useNotifications>}){
  const {api,colors,published}=useApp(),following=tab==='following',preparing=following&&setup.mode==='loading';
  const headerHeight=SCROLL_HEADER_HEIGHT+(fid?FEED_TABS_HEIGHT:0),motion=useScrollHeader(headerHeight);
  const list=useRef<FlatList<Cast>>(null);
  const page=useCastPage((cursor,signal)=>{
    if(!following)return api.publicFeed(cursor,signal);
    if(preparing)return Promise.resolve({items:[],next:''});
    if(setup.mode!=='indexed')throw new Error(setup.error||'Your Following feed isn’t available right now. Browse All or try again.');
    return api.followingFeed(fid!,cursor,signal);
  },[api,fid,tab,following?setup.mode:'public']);
  const retry=()=>void(following&&setup.mode!=='indexed'?setup.retry():page.retry());
  const refresh=()=>void(following&&setup.mode!=='indexed'?setup.retry():page.refresh());
  function tapTitle(){
    if(!motion.isAtTop())list.current?.scrollToOffset({offset:0,animated:true});
    else if(!page.loading&&!preparing)refresh();
  }
  const feed={...page,loading:page.loading||preparing,error:preparing?'':page.error,retry,refresh,items:mergeCasts(following?[]:published,page.items).filter(cast=>!cast.data.castAddBody.parentCastId).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  return <View style={{flex:1,overflow:'hidden'}}>
    <CastList listRef={list} page={feed} autoLoadMore empty={following?'No casts from people you follow yet':'No casts yet'} onScroll={motion.onScroll} contentTopInset={headerHeight}/>
    <ScrollHeader title="Kite" logo onTitlePress={tapTitle} titleAccessibilityLabel="Kite: scroll to top or refresh feed" hidden={motion.hidden} headerY={motion.headerY} refreshing={page.refreshing} disabled={page.loading||preparing} onRefresh={refresh} refreshLabel="Refresh feed" testID="home-header"/>
    {!!fid&&<Animated.View testID="home-feed-tabs" accessibilityRole="tablist" accessibilityLabel="Home feed" pointerEvents={motion.hidden?'none':'auto'} accessibilityElementsHidden={motion.hidden} importantForAccessibility={motion.hidden?'no-hide-descendants':'auto'} style={{position:'absolute',top:SCROLL_HEADER_HEIGHT,left:0,right:0,height:FEED_TABS_HEIGHT,zIndex:20,flexDirection:'row',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.line,transform:[{translateY:motion.headerY}]}}>
      {(['following','all'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityLabel={value==='following'?'Following feed':'All casts'} accessibilityState={{selected:tab===value}} aria-selected={tab===value} onPress={()=>onTab(value)} style={{flex:1,height:FEED_TABS_HEIGHT,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{fontSize:15,fontWeight:tab===value?'700':'500',color:tab===value?colors.ink:colors.muted}}>{value==='following'?'Following':'All'}</Text></Pressable>)}
    </Animated.View>}
  </View>;
}
