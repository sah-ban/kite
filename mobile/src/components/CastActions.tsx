import {router} from 'expo-router';
import {useState} from 'react';
import {ActivityIndicator,Linking,Pressable,Text,View} from 'react-native';
import {type Cast,type Page,castKey,mergeCasts} from '../lib/model';
import {reactionKey,useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {useCastClient} from '../lib/use-cast-client';
import {Icon} from './ui';
import {ClientAvatar} from './ClientAvatar';
import {FarcasterIcon} from './FarcasterIcon';
import {LikeIcon,QuoteIcon} from './CastActionIcons';

const countLabel=(count:number|null|undefined,more=false)=>count===null||count===undefined?'—':`${count}${more?'+':''}`;
export function CastActions({cast,enabled=true,conversation=false}:{cast:Cast;enabled?:boolean;conversation?:boolean}){
  const {api,colors,account,accountBusy,reactions,react,published,deletedCasts}=useApp();
  const [busy,setBusy]=useState<'likes'|'recasts'|null>(null),[error,setError]=useState('');
  const session=account.session;
  const client=useCastClient(cast.data.fid,cast.signer,enabled&&!conversation);
  const {value}=useQuery(()=>enabled?api.activity(cast):Promise.resolve(undefined),[api,cast.data.fid,cast.hash,enabled]);
  const localReplies=published.filter(reply=>reply.data.castAddBody.parentCastId?.fid===cast.data.fid&&reply.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase());
  const replyCount=value?.replies?mergeCasts(value.replies.items,localReplies).filter(reply=>!deletedCasts.has(castKey(reply))).length:null;
  const mine=useQuery(async()=>{
    if(!enabled||!session)return undefined;
    const [likes,recasts]=await Promise.all([api.hasReaction(session.fid,cast,'likes'),api.hasReaction(session.fid,cast,'recasts')]);
    return {likes,recasts};
  },[api,cast.data.fid,cast.hash,enabled,session?.fid]);
  async function toggle(kind:'likes'|'recasts',active:boolean|undefined,page:Page<number>|null|undefined){
    if(!session){router.push('/sign-in');return;}
    if(busy||accountBusy||active===undefined)return;
    setBusy(kind);setError('');
    try{await react(cast,kind,active,page?.items.length??null,!!page?.next);}
    catch(error){setError(error instanceof Error?error.message:'Could not update your reaction. Please try again.');}
    finally{setBusy(null);}
  }
  return <View>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reply to cast" accessibilityHint={`${countLabel(replyCount,!!value?.replies?.next)} replies`} onPress={event=>{event.stopPropagation();if(!session)router.push('/sign-in');else router.push({pathname:'/compose',params:{replyFid:String(cast.data.fid),replyHash:cast.hash}});}} style={{minWidth:48,height:44,flexDirection:'row',gap:4,alignItems:'center',justifyContent:'flex-start'}}><Icon name="message-circle" size={18} color={colors.muted}/><Text style={{fontSize:12,color:colors.muted}}>{countLabel(replyCount,!!value?.replies?.next)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Quote cast" onPress={event=>{event.stopPropagation();if(!session)router.push('/sign-in');else router.push({pathname:'/compose',params:{quoteFid:String(cast.data.fid),quoteHash:cast.hash}});}} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><QuoteIcon color={colors.muted}/></Pressable>
      {(['recasts','likes'] as const).map(kind=>{
        const override=session?reactions.get(reactionKey(session.fid,cast,kind)):undefined;
        const active=override?.active??mine.value?.[kind],page=value?.[kind];
        const count=override?override.count:page?.items.length,more=override?.more??!!page?.next;
        const color=active?(kind==='likes'?colors.danger:colors.accent):colors.muted;
        const disabled=!!busy||accountBusy||!!session&&active===undefined;
        return <Pressable key={kind} accessibilityRole="button" accessibilityLabel={kind==='likes'?(active?'Unlike cast':'Like cast'):(active?'Undo repost':'Repost cast')} accessibilityState={{disabled,selected:!!active,busy:busy===kind}} accessibilityHint={`${countLabel(count,more)} ${kind==='likes'?'likes':'reposts'}`} disabled={disabled} onPress={event=>{event.stopPropagation();void toggle(kind,active,page);}} style={({pressed})=>({minWidth:44,height:44,paddingHorizontal:2,borderRadius:20,flexDirection:'row',gap:4,alignItems:'center',justifyContent:'center',opacity:disabled&&busy!==kind?.5:1,backgroundColor:pressed?colors.soft:'transparent'})}>
          {busy===kind?<ActivityIndicator size="small" color={colors.accent}/>:kind==='likes'?<LikeIcon color={color} filled={!!active}/>:<Icon name="repeat" size={18} color={color}/>}<Text style={{fontSize:12,color}}>{countLabel(count,more)}</Text>
        </Pressable>;
      })}
      {conversation?<Pressable accessibilityRole="link" accessibilityLabel="Open in Farcaster" onPress={event=>{event.stopPropagation();void Linking.openURL(`https://farcaster.xyz/~/conversations/${cast.hash}`).catch(()=>setError('Could not open Farcaster. Please try again.'));}} style={{width:40,height:44,alignItems:'flex-end',justifyContent:'center'}}><FarcasterIcon/></Pressable>:<Pressable accessibilityRole="link" accessibilityLabel={client.value?`View client ${client.value.username?'@'+client.value.username:'FID '+client.value.fid}`:client.loading?'Resolving client':'Unknown client'} accessibilityState={{disabled:!client.value}} disabled={!client.value} onPress={event=>{event.stopPropagation();if(client.value)router.push(`/profile/${client.value.fid}`);}} style={{width:40,height:44,alignItems:'flex-end',justifyContent:'center'}}>{client.value?<ClientAvatar key={`${client.value.fid}:${client.value.avatar||client.value.logo||''}`} client={client.value}/>:client.loading?<ActivityIndicator size="small" color={colors.muted}/>:<Icon name="grid" size={18} color={colors.muted}/>}</Pressable>}
    </View>
    {!!(error||mine.error)&&<View accessibilityRole="alert" style={{gap:4}}><Text style={{fontSize:12,lineHeight:18,color:colors.danger}}>{error||'Could not check your reactions.'}</Text>{!!mine.error&&<Pressable accessibilityRole="button" onPress={event=>{event.stopPropagation();mine.reload();}} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:13,fontWeight:'600',color:colors.accent}}>Retry</Text></Pressable>}</View>}
  </View>;
}
