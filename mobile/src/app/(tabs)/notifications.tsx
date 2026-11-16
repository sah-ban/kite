import {router,useFocusEffect} from 'expo-router';
import {memo,useCallback,useMemo,useRef,useState} from 'react';
import {AppState,FlatList,Pressable,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {useNotifications} from '../../lib/notification-state';
import {hasMoreNotifications,indexedNotifications,mergeNotifications,readNotifications,type IndexedNotificationPage,type NotificationItem,type NotificationKind,type NotificationPage} from '../../lib/notifications';
import {relativeTime} from '../../lib/model';
import {CastText,Person,Quote} from '../../components/CastCard';
import {Button,Icon,Loading,Notice,space} from '../../components/ui';

const filters=[['all','All'],['mention','Mentions'],['reply','Replies'],['like','Likes'],['recast','Recasts'],['follow','Follows']] as const;
const labels={mention:'mentioned you',reply:'replied to your cast',like:'liked your cast',recast:'recast your cast',follow:'followed you'};
const icons={mention:'at-sign',reply:'message-circle',like:'heart',recast:'repeat',follow:'user-plus'} as const;
const NotificationRow=memo(function NotificationRow({item}:{item:NotificationItem}){
  const {colors}=useApp();const target=item.cast?{fid:item.cast.data.fid,hash:item.cast.hash}:item.target;
  return <Pressable accessibilityRole="link" accessibilityLabel={`${labels[item.kind]}. Open ${target?'cast':'profile'}`} onPress={()=>router.push(target?`/cast/${target.fid}/${target.hash}`:`/profile/${item.actor}`)} style={{flexDirection:'row',gap:12,padding:16,borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
    <View style={{paddingTop:10}}><Icon name={icons[item.kind]} size={20} color={item.kind==='like'?colors.danger:colors.accent}/></View>
    <View style={{flex:1,gap:7}}><Person fid={item.actor} dense/><View style={[space.row,{justifyContent:'space-between'}]}><Text style={{color:colors.muted,fontSize:14,flex:1}}>{labels[item.kind]}</Text><Text style={{color:colors.muted,fontSize:12}}>{relativeTime(item.timestamp)}</Text></View>
      {(item.kind==='like'||item.kind==='recast')&&target?<Quote fid={target.fid} hash={target.hash} initialCast={item.cast}/>:item.cast?<CastText cast={item.cast} limit={240} numberOfLines={4}/>:null}
    </View>
  </Pressable>;
});
const renderNotification=({item}:{item:NotificationItem})=><NotificationRow item={item}/>;
const notificationKey=(item:NotificationItem)=>item.id;
export default function Notifications(){
  const {account}=useApp();
  return <NotificationFeed key={account.session?.fid||0}/>;
}
function NotificationFeed(){
  const {api,account,colors}=useApp(),fid=account.session?.fid;
  const {mode,error:setupError,retry:retrySetup,since,markSeen}=useNotifications();
  const [filter,setFilter]=useState<NotificationKind|'all'>('all'),[items,setItems]=useState<NotificationItem[]>([]),[live,setLive]=useState<IndexedNotificationPage>(),[legacy,setLegacy]=useState<NotificationPage>(),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[updates,setUpdates]=useState(false),[revision,setRevision]=useState(0);
  const activeRequest=useRef<AbortController|null>(null),currentPage=useRef<IndexedNotificationPage|undefined>(undefined),pending=useRef(false);
  const requestFilter=mode==='indexed'?filter:'all';
  const refresh=()=>{activeRequest.current?.abort();setRefreshing(true);setRevision(value=>value+1);};
  useFocusEffect(useCallback(()=>{
    if(!fid||mode==='loading'||mode==='error')return;
    const controller=new AbortController();activeRequest.current=controller;currentPage.current=undefined;pending.current=false;
    setItems([]);setLive(undefined);setLegacy(undefined);setError('');setUpdates(false);
    async function load(){
      if(pending.current||controller.signal.aborted||AppState.currentState!=='active')return;
      pending.current=true;if(!currentPage.current)setBusy(true);
      try{
        if(mode==='indexed'){
          const page=await indexedNotifications(api,fid!,{kind:requestFilter,since:since(),signal:controller.signal});
          if(controller.signal.aborted)return;
          // Polling only announces changes; keep row data and scroll geometry stable until refresh.
          const previous=currentPage.current;
          if(previous){
            setUpdates(JSON.stringify(page.items)!==JSON.stringify(previous.items.slice(0,50)));
            setLive(value=>value&&(value.workerOnline!==page.workerOnline||value.startedAt!==page.startedAt)?{...value,workerOnline:page.workerOnline,startedAt:page.startedAt}:value);
          }
          else{currentPage.current=page;setLive(page);setItems(page.items);if(AppState.currentState==='active')markSeen(page.serverTime);}
        }else{
          const page=await readNotifications(api,fid!,undefined,controller.signal);
          if(controller.signal.aborted)return;setLegacy(page);setItems(page.items);
        }
        setError('');
      }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not load notifications.');}
      finally{if(!controller.signal.aborted)pending.current=false;if(!controller.signal.aborted){setBusy(false);setRefreshing(false);}}
    }
    void load();const timer=mode==='indexed'?setInterval(()=>void load(),10000):undefined;
    const listener=AppState.addEventListener('change',state=>{if(state==='active')void load();});
    return()=>{controller.abort();activeRequest.current?.abort();clearInterval(timer);listener.remove();};
    // Revision intentionally restarts the focused request after a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[api,fid,mode,requestFilter,since,markSeen,revision]));
  async function more(){
    if(!fid||pending.current)return;
    const token=live?.nextPageToken;
    if(mode==='indexed'?!token:!legacy||!hasMoreNotifications(legacy.cursor))return;
    const controller=new AbortController();activeRequest.current=controller;pending.current=true;setBusy(true);setError('');
    try{
      if(mode==='indexed'){
        const page=await indexedNotifications(api,fid,{kind:filter,cursor:token,since:since(),signal:controller.signal});
        if(controller.signal.aborted)return;
        const merged={...page,items:[...items,...page.items.filter(item=>!items.some(old=>old.id===item.id))]};currentPage.current=merged;setLive(merged);setItems(merged.items);
      }else{
        const page=await readNotifications(api,fid,legacy!.cursor,controller.signal);if(controller.signal.aborted)return;
        const merged={...page,items:mergeNotifications(items,page.items)};setLegacy(merged);setItems(merged.items);
      }
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not load older activity.');}
    finally{if(!controller.signal.aborted){pending.current=false;setBusy(false);}}
  }
  const filtered=useMemo(()=>mode==='legacy'?items.filter(item=>filter==='all'||item.kind===filter):items,[mode,items,filter]);
  if(!fid)return <View style={{flex:1,justifyContent:'center'}}><Notice title="Your activity, in one place." icon="bell">Sign in to see mentions, replies, likes, recasts and follows.</Notice><View style={{paddingHorizontal:28}}><Button label="Sign in" onPress={()=>router.push('/sign-in')}/></View></View>;
  if(mode==='loading')return <Loading/>;
  if(mode==='error')return <Notice title="Couldn’t prepare notifications" icon="bell" retry={retrySetup}>{setupError}</Notice>;
  return <View style={{flex:1}}>
    <View style={[space.row,{paddingHorizontal:18,minHeight:56,backgroundColor:colors.surface}]}><Text style={{flex:1,fontSize:21,fontWeight:'700',color:colors.ink}}>Notifications</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh notifications" disabled={busy} onPress={refresh} style={{padding:12}}><Icon name="refresh-cw" size={18} color={colors.muted}/></Pressable></View>
    <View style={{backgroundColor:colors.surface,borderBottomWidth:1,borderColor:colors.line}}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:14,paddingBottom:12,gap:8}}>{filters.map(([kind,label])=><Pressable key={kind} accessibilityRole="button" accessibilityState={{selected:filter===kind}} onPress={()=>setFilter(kind)} style={{paddingHorizontal:14,paddingVertical:10,borderRadius:20,backgroundColor:filter===kind?colors.accent:colors.soft}}><Text style={{fontSize:13,fontWeight:'600',color:filter===kind?colors.background:colors.muted}}>{label}</Text></Pressable>)}</ScrollView></View>
    <FlatList data={filtered} keyExtractor={notificationKey} renderItem={renderNotification} initialNumToRender={8} maxToRenderPerBatch={4} windowSize={5} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]}/>} ListHeaderComponent={<View>
      {!!error&&<View accessibilityRole="alert" style={{padding:16,gap:10}}><Text style={{color:colors.danger}}>{error}</Text><Button label="Retry" quiet disabled={busy} onPress={()=>items.length&&(live?.nextPageToken||legacy&&hasMoreNotifications(legacy.cursor))?void more():refresh()}/></View>}
      {!!legacy?.errors.length&&<View style={{padding:16,gap:10}}><Text style={{color:colors.danger}}>Some activity could not load: {legacy.errors.join(', ')}.</Text><Button label="Retry" quiet disabled={busy} onPress={()=>void more()}/></View>}
      {live&&(!live.workerOnline||!live.startedAt)&&<Text accessibilityRole="text" style={{padding:16,color:colors.muted}}>{!live.startedAt?'Waiting for notification indexing to start…':'Updates are reconnecting. Saved activity is shown below.'}</Text>}
      {updates&&<Button label="Activity has changed · Refresh" quiet onPress={refresh}/>}
    </View>} ListEmptyComponent={busy?<Loading/>:<Notice title={error?'Notifications are unavailable':filter==='all'?'You’re all caught up':`No ${filters.find(([kind])=>kind===filter)?.[1].toLowerCase()} yet`} icon="bell">{error?'Retry to check again.':mode==='indexed'?'New activity will appear here automatically.':'Refresh or load older activity to check for more.'}</Notice>}
    ListFooterComponent={<View style={{padding:18,gap:16,paddingBottom:32}}>{busy&&items.length>0?<Loading/>:(live?.nextPageToken||legacy&&hasMoreNotifications(legacy.cursor))?<Button label="Load more activity" quiet onPress={()=>void more()}/>:null}{live&&<Text style={{color:colors.muted,fontSize:12,lineHeight:18,textAlign:'center'}}>New activity{live.startedAt?` since ${new Date(live.startedAt).toLocaleString()}`:' after setup'} · Kept for {live.historyDays} days. Earlier activity is not imported.</Text>}{legacy&&<Text style={{color:colors.muted,fontSize:12,lineHeight:18,textAlign:'center'}}>Replies, likes and recasts checked on {legacy.cursor.scanned} of your recent casts. Mentions and follows load separately.</Text>}</View>}/>
  </View>;
}
