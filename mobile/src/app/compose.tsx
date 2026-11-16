import {router,useLocalSearchParams} from 'expo-router';
import {View} from 'react-native';
import {useApp} from '../lib/state';
import {resolveDraftRouteKey} from '../lib/drafts';
import {validRef} from '../lib/composer';
import {Button,Notice} from '../components/ui';
import {CastComposer} from '../components/CastComposer';

export default function ComposeRoute(){
  const {account,api}=useApp();const {replyFid,replyHash,quoteFid,quoteHash,draftKey:requestedKey}=useLocalSearchParams<{replyFid?:string;replyHash?:string;quoteFid?:string;quoteHash?:string;draftKey?:string}>();
  const resolved=requestedKey&&account.session?resolveDraftRouteKey(requestedKey,account.session.fid,api.origin):undefined;
  const draftKey=resolved?.key,location=resolved?.location;
  if(requestedKey&&(!location||location.editHash))return <Notice title="Could not open draft">This draft is not available for this account.</Notice>;
  const parent=location?.parent||(replyFid||replyHash?{fid:Number(replyFid),hash:replyHash||''}:undefined);
  const quote=location?.quote||(quoteFid||quoteHash?{fid:Number(quoteFid),hash:quoteHash||''}:undefined);
  if(parent&&!validRef(parent))return <Notice title="Could not open reply">This cast link is incomplete.</Notice>;
  if(quote&&!validRef(quote))return <Notice title="Could not quote cast">This cast link is incomplete.</Notice>;
  if(!account.session)return <View style={{padding:20,gap:14}}><Notice title="Join the conversation">Sign in with Farcaster to publish a cast.</Notice><Button label="Sign in with Farcaster" onPress={()=>router.push('/sign-in')}/></View>;
  return <CastComposer storageKey={draftKey} key={`${draftKey||'new'}:${account.session.fid}:${parent?.fid||0}:${parent?.hash||''}:${quote?.fid||0}:${quote?.hash||''}`} fid={account.session.fid} parent={parent} quote={quote}/>;
}
