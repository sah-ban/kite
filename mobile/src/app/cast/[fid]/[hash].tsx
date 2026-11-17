import {HapticPressable as Pressable} from '../../../components/HapticControls';
import {Stack,useLocalSearchParams} from 'expo-router';
import {useRef,useState,type ComponentRef} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {type Cast,castKey,isFid,isHash,mergeCasts} from '../../../lib/model';
import {useApp} from '../../../lib/state';
import {useCastPage,useQuery} from '../../../lib/hooks';
import {CastCard,Person} from '../../../components/CastCard';
import {CastList} from '../../../components/CastList';
import {Button,Loading,Notice} from '../../../components/ui';
import {articleChain,isArticle} from '../../../lib/articles';
import {ArticleReader} from '../../../components/ArticleReader';
import {useParentCasts} from '../../../lib/use-parent-casts';
import {usePrependAnchor} from '../../../lib/use-prepend-anchor';

export default function Conversation(){
  const {fid,hash}=useLocalSearchParams<{fid:string;hash:string}>(),{api,deletedCasts}=useApp();const author=Number(fid);
  const valid=isFid(author)&&isHash(hash);
  const cast=useQuery(async signal=>{
    if(!valid)throw new Error('This cast link is invalid.');
    const value=await api.resolveCast(String(author),hash,signal),root=isArticle(value)?articleChain(value)?.root:undefined;
    return root?api.resolveCast(String(root.fid),root.hash,signal):value;
  },[api,author,hash,valid]);
  if(valid&&deletedCasts.has(castKey({data:{fid:author},hash})))return <Notice title="Cast deleted">Your cast has been deleted.</Notice>;
  return cast.loading?<Loading/>:cast.error?<Notice title="Cast unavailable" retry={cast.reload}>{cast.error}</Notice>:cast.value?<Thread key={`${api.origin}:${castKey(cast.value)}`} cast={cast.value}/>:null;
}
function Thread({cast}:{cast:Cast}){
  const {api,colors,published}=useApp();const [tab,setTab]=useState<'replies'|'likes'|'recasts'>('replies');
  const parents=useParentCasts(cast),context=cast.data.castAddBody.parentCastId?<ParentContext parents={parents}/>:undefined;
  const page=useCastPage((cursor,signal)=>api.replies(cast,cursor,signal),[api,cast.hash,cast.data.fid]);
  const replies={...page,items:mergeCasts(page.items,published.filter(reply=>reply.data.castAddBody.parentCastId?.fid===cast.data.fid&&reply.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase())).filter(reply=>{const chain=articleChain(reply);return !isArticle(cast)||chain?.root?.fid!==cast.data.fid||chain.root.hash.toLowerCase()!==cast.hash.toLowerCase();}).sort((a,b)=>a.data.timestamp-b.data.timestamp)};
  const header=<View><Stack.Screen options={{title:isArticle(cast)?'Article':'Conversation'}}/>{isArticle(cast)?<ArticleReader cast={cast} threadBefore={parents.items.length>0}/>:<CastCard cast={cast} expanded threadBefore={parents.items.length>0}/>}<View style={{flexDirection:'row',borderBottomWidth:1,borderColor:colors.line}}>{(['replies','likes','recasts'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} onPress={()=>setTab(value)} style={{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:12,paddingVertical:10,borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{color:tab===value?colors.ink:colors.muted,fontWeight:'600'}}>{value==='recasts'?'Reposts':value[0].toUpperCase()+value.slice(1)}</Text></Pressable>)}</View></View>;
  return tab==='replies'?<CastList page={replies} beforeHeader={context} onNearTop={parents.nearTop} header={header} empty="No replies yet"/>:<ReactionScroll context={context} nearTop={parents.nearTop}>{header}<Reactions key={tab} cast={cast} kind={tab}/></ReactionScroll>;
}
function ParentContext({parents}:{parents:ReturnType<typeof useParentCasts>}){
  const {colors}=useApp();
  return <View testID="conversation-parents">
    {parents.loading?<Loading/>:parents.error?<View style={{padding:14,gap:10}}><Text accessibilityRole="alert" style={{color:colors.muted,fontSize:13,lineHeight:19}}>{parents.error}</Text>{parents.more&&<Button quiet label="Retry earlier casts" onPress={parents.load}/>}</View>:parents.more?<View style={{paddingHorizontal:14,paddingVertical:6}}><Button quiet label="Load earlier casts" onPress={parents.load}/></View>:parents.items.length>0?<Text style={{padding:14,color:colors.muted,fontSize:12}}>Start of conversation</Text>:null}
    {parents.items.map((parent,index)=><CastCard key={castKey(parent)} cast={parent} threadBefore={index>0} threadAfter/>)}
  </View>;
}
function ReactionScroll({context,nearTop,children}:{context?:React.ReactElement;nearTop:()=>void;children:React.ReactNode}){
  const scroll=useRef<ComponentRef<typeof ScrollView>>(null),anchor=usePrependAnchor(y=>scroll.current?.scrollTo({y,animated:false}),nearTop);
  return <ScrollView ref={scroll} onScroll={context?anchor.onScroll:undefined} scrollEventThrottle={32}>{context&&<View onLayout={anchor.onLayout}>{context}</View>}{children}</ScrollView>;
}
function Reactions({cast,kind}:{cast:Cast;kind:'likes'|'recasts'}){
  const {api,colors}=useApp();const first=useQuery(signal=>api.reactions(cast,kind,'',signal),[api,cast.hash,kind]);
  const [extra,setExtra]=useState<number[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const next=cursor??first.value?.next;
  async function more(){if(!next||busy)return;setBusy(true);setError('');try{const result=await api.reactions(cast,kind,next);setExtra(previous=>[...new Set([...previous,...result.items])]);setCursor(result.next===next?'':result.next);}catch(error){setError(error instanceof Error?error.message:'Could not load reactions.');}finally{setBusy(false);}}
  const people=[...new Set([...(first.value?.items||[]),...extra])];
  return <View style={{paddingHorizontal:14,paddingVertical:10,gap:6}}>{first.loading?<Loading/>:first.error?<Notice title="Couldn’t load reactions" retry={first.reload}>{first.error}</Notice>:people.length?people.map(fid=><Person key={fid} fid={fid}/>):<Notice title={`No ${kind==='recasts'?'reposts':kind} yet`} icon={kind==='likes'?'heart':'repeat'}/>}{!!error&&<Text style={{color:colors.danger}}>{error}</Text>}{!!next&&<Button quiet label={busy?'Loading…':'Load more'} disabled={busy} onPress={()=>void more()}/>}</View>;
}
