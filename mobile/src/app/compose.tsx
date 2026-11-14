import {router,useLocalSearchParams} from 'expo-router';
import {View} from 'react-native';
import {useApp} from '../lib/state';
import {validRef} from '../lib/composer';
import {Button,Notice} from '../components/ui';
import {CastComposer} from '../components/CastComposer';

export default function ComposeRoute(){
  const {account}=useApp();const {replyFid,replyHash}=useLocalSearchParams<{replyFid?:string;replyHash?:string}>();
  const parent=replyFid||replyHash?{fid:Number(replyFid),hash:replyHash||''}:undefined;
  if(parent&&!validRef(parent))return <Notice title="Could not open reply">This cast link is incomplete.</Notice>;
  if(!account.session)return <View style={{padding:20,gap:14}}><Notice title="Join the conversation">Sign in with Farcaster to publish a cast.</Notice><Button label="Sign in with Farcaster" onPress={()=>router.push('/sign-in')}/></View>;
  return <CastComposer key={`${account.session.fid}:${parent?.fid||0}:${parent?.hash||''}`} fid={account.session.fid} parent={parent}/>;
}
