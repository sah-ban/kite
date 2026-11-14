import {router} from 'expo-router';
import {Alert,Pressable,Share,Text,View} from 'react-native';
import {type Cast,type Page,castRoute} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Icon} from './ui';

const countLabel=(page:Page<number>|null|undefined)=>page?`${page.items.length}${page.next?'+':''}`:'—';
export function CastActions({cast,enabled=true}:{cast:Cast;enabled?:boolean}){
  const {api,colors}=useApp();
  const {value}=useQuery(()=>enabled?api.activity(cast):Promise.resolve(undefined),[api,cast.data.fid,cast.hash,enabled]);
  return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
    <Pressable accessibilityRole="link" accessibilityLabel="View replies" onPress={event=>{event.stopPropagation();router.push(castRoute(cast));}} style={{width:40,height:44,alignItems:'flex-start',justifyContent:'center'}}><Icon name="message-circle" size={18} color={colors.muted}/></Pressable>
    {(['recasts','likes'] as const).map(kind=><Pressable key={kind} accessibilityRole="button" accessibilityLabel={kind==='likes'?'Like cast':'Repost cast'} accessibilityHint={`${countLabel(value?.[kind])} ${kind==='likes'?'likes':'reposts'}`} onPress={event=>{event.stopPropagation();Alert.alert('Sign in to Kite',`Connect your Farcaster account to ${kind==='likes'?'like':'repost'} casts.`);}} style={({pressed})=>({minWidth:52,height:44,paddingHorizontal:6,borderRadius:20,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent'})}>
      <Icon name={kind==='likes'?'heart':'repeat'} size={18} color={colors.muted}/><Text style={{fontSize:12,color:colors.muted}}>{countLabel(value?.[kind])}</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Share cast" onPress={event=>{event.stopPropagation();void Share.share({message:`https://kite.sahban.dev${castRoute(cast)}`}).catch(()=>{});}} style={{width:40,height:44,alignItems:'flex-end',justifyContent:'center'}}><Icon name="share" size={18} color={colors.muted}/></Pressable>
  </View>;
}
