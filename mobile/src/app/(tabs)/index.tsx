import {useMemo,useRef,useState} from 'react';
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
  const [visited,setVisited]=useState<HomeFeed[]>(()=>[fid?'following':'all']);
  function select(value:HomeFeed){
    if(value===tab)return;
    setVisited(previous=>previous.includes(value)?previous:[...previous,value]);setTab(value);
  }
  return <View style={{flex:1}}>{visited.map(value=><View key={value} testID={`home-${value}-pane`} pointerEvents={tab===value?'auto':'none'} accessibilityElementsHidden={tab!==value} importantForAccessibility={tab===value?'auto':'no-hide-descendants'} aria-hidden={tab!==value} style={{position:'absolute',inset:0,opacity:tab===value?1:0,zIndex:tab===value?1:0}}><Timeline fid={fid} tab={value} active={tab===value} onTab={select} setup={setup}/></View>)}</View>;
}
function Timeline({fid,tab,active,onTab,setup}:{fid?:number;tab:HomeFeed;active:boolean;onTab:(value:HomeFeed)=>void;setup:ReturnType<typeof useNotifications>}){
  const {api,colors,published}=useApp(),following=tab==='following',preparing=following&&setup.mode==='loading';
  const headerHeight=SCROLL_HEADER_HEIGHT+(fid?FEED_TABS_HEIGHT:0),motion=useScrollHeader(headerHeight);
  const list=useRef<FlatList<Cast>>(null);
  const [requested,setRequested]=useState(false);
  const page=useCastPage((cursor,signal)=>{
    if(!following)return api.publicFeed(cursor,signal);
    if(preparing){setRequested(false);return Promise.resolve({items:[],next:''});}
    if(setup.mode!=='indexed'){setRequested(false);throw new Error(setup.error||'Your Following feed isn’t available right now. Browse All or try again.');}
    setRequested(true);
    return api.followingFeed(fid!,cursor,signal);
  },[api,fid,tab,following?setup.mode:'public']);
  const retry=()=>void(following&&setup.mode!=='indexed'?setup.retry():page.retry());
  const refresh=()=>void(following&&setup.mode!=='indexed'?setup.retry():page.refresh());
  function tapTitle(){
    if(!motion.isAtTop())list.current?.scrollToOffset({offset:0,animated:true});
    else if(!page.loading&&!preparing)refresh();
  }
  const loading=page.loading||preparing||following&&setup.mode==='indexed'&&!requested;
  const items=useMemo(()=>mergeCasts(following?[]:published,page.items).filter(cast=>!cast.data.castAddBody.parentCastId).sort((a,b)=>b.data.timestamp-a.data.timestamp),[following,published,page.items]);
  const feed={...page,loading,error:preparing?'':page.error,retry,refresh,items};
  return <View style={{flex:1,overflow:'hidden'}}>
    <CastList active={active} listRef={list} page={feed} autoLoadMore empty={following?'No casts from people you follow yet':'No casts yet'} onScroll={motion.onScroll} contentTopInset={headerHeight}/>
    <ScrollHeader title="Kite" logo onTitlePress={tapTitle} titleAccessibilityLabel="Kite: scroll to top or refresh feed" hidden={!active||motion.hidden} headerY={motion.headerY} testID={active?'home-header':'home-header-inactive'}/>
    {!!fid&&<Animated.View testID={active?'home-feed-tabs':'home-feed-tabs-inactive'} accessibilityRole="tablist" accessibilityLabel="Home feed" pointerEvents={!active||motion.hidden?'none':'auto'} accessibilityElementsHidden={!active||motion.hidden} importantForAccessibility={!active||motion.hidden?'no-hide-descendants':'auto'} style={{position:'absolute',top:SCROLL_HEADER_HEIGHT,left:0,right:0,height:FEED_TABS_HEIGHT,zIndex:20,flexDirection:'row',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.line,transform:[{translateY:motion.headerY}]}}>
      {(['following','all'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityLabel={value==='following'?'Following feed':'All casts'} accessibilityState={{selected:tab===value}} aria-selected={tab===value} onPress={()=>onTab(value)} style={{flex:1,height:FEED_TABS_HEIGHT,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{fontSize:15,fontWeight:tab===value?'700':'500',color:tab===value?colors.ink:colors.muted}}>{value==='following'?'Following':'All'}</Text></Pressable>)}
    </Animated.View>}
  </View>;
}
