import {useLocalSearchParams} from 'expo-router';
import {useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {type Cast,castKey,isFid,isHash,mergeCasts} from '../../../lib/model';
import {useApp} from '../../../lib/state';
import {useCastPage,useQuery} from '../../../lib/hooks';
import {CastCard,Person} from '../../../components/CastCard';
import {CastList} from '../../../components/CastList';
import {Button,Loading,Notice} from '../../../components/ui';

export default function Conversation(){
  const {fid,hash}=useLocalSearchParams<{fid:string;hash:string}>(),{api,deletedCasts}=useApp();const author=Number(fid);
  const valid=isFid(author)&&isHash(hash);
  const cast=useQuery(signal=>valid?api.resolveCast(String(author),hash,signal):Promise.reject(new Error('This cast link is invalid.')),[api,author,hash,valid]);
  if(valid&&deletedCasts.has(castKey({data:{fid:author},hash})))return <Notice title="Cast deleted">Your cast has been deleted.</Notice>;
  return cast.loading?<Loading/>:cast.error?<Notice title="Cast unavailable" retry={cast.reload}>{cast.error}</Notice>:cast.value?<Thread cast={cast.value}/>:null;
}
function Thread({cast}:{cast:Cast}){
  const {api,colors,published}=useApp();const [tab,setTab]=useState<'replies'|'likes'|'recasts'>('replies');
  const page=useCastPage((cursor,signal)=>api.replies(cast,cursor,signal),[api,cast.hash,cast.data.fid]);
  const replies={...page,items:mergeCasts(page.items,published.filter(reply=>reply.data.castAddBody.parentCastId?.fid===cast.data.fid&&reply.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase())).sort((a,b)=>a.data.timestamp-b.data.timestamp)};
  const header=<View><CastCard cast={cast} expanded/><View style={{flexDirection:'row',borderBottomWidth:1,borderColor:colors.line}}>{(['replies','likes','recasts'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} onPress={()=>setTab(value)} style={{flex:1,alignItems:'center',padding:16,borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{color:tab===value?colors.ink:colors.muted,fontWeight:'600'}}>{value==='recasts'?'Reposts':value[0].toUpperCase()+value.slice(1)}</Text></Pressable>)}</View></View>;
  return tab==='replies'?<CastList page={replies} header={header} empty="No replies yet"/>:<ScrollView>{header}<Reactions key={tab} cast={cast} kind={tab}/></ScrollView>;
}
function Reactions({cast,kind}:{cast:Cast;kind:'likes'|'recasts'}){
  const {api,colors}=useApp();const first=useQuery(signal=>api.reactions(cast,kind,'',signal),[api,cast.hash,kind]);
  const [extra,setExtra]=useState<number[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const next=cursor??first.value?.next;
  async function more(){if(!next||busy)return;setBusy(true);setError('');try{const result=await api.reactions(cast,kind,next);setExtra(previous=>[...new Set([...previous,...result.items])]);setCursor(result.next===next?'':result.next);}catch(error){setError(error instanceof Error?error.message:'Could not load reactions.');}finally{setBusy(false);}}
  const people=[...new Set([...(first.value?.items||[]),...extra])];
  return <View style={{padding:18,gap:12}}>{first.loading?<Loading/>:first.error?<Notice title="Couldn’t load reactions" retry={first.reload}>{first.error}</Notice>:people.length?people.map(fid=><Person key={fid} fid={fid}/>):<Notice title={`No ${kind==='recasts'?'reposts':kind} yet`} icon={kind==='likes'?'heart':'repeat'}/>}{!!error&&<Text style={{color:colors.danger}}>{error}</Text>}{!!next&&<Button quiet label={busy?'Loading…':'Load more'} disabled={busy} onPress={()=>void more()}/>}</View>;
}
