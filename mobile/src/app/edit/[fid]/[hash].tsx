import AsyncStorage from '@react-native-async-storage/async-storage';
import {Stack,router,useLocalSearchParams} from 'expo-router';
import {View} from 'react-native';
import {useApp} from '../../../lib/state';
import {useQuery} from '../../../lib/hooks';
import {castRoute,isFid,isHash} from '../../../lib/model';
import {editKey,readEditAttempt,readEditDraft} from '../../../lib/cast-edit';
import {CastComposer} from '../../../components/CastComposer';
import {Button,Loading,Notice} from '../../../components/ui';
import {isArticle} from '../../../lib/articles';

export default function EditCastRoute(){
  const {fid,hash}=useLocalSearchParams<{fid:string;hash:string}>(),{api,account}=useApp();
  const session=account.session,author=Number(fid);
  const context=useQuery(async signal=>{
    if(!session||!isFid(author)||!isHash(hash)||session.fid!==author)throw new Error('You can only edit your own casts.');
    const attempt=await readEditAttempt(AsyncStorage,editKey(api.origin,author,hash),session,hash);
    const cast=attempt?.source||await api.resolveCast(fid,hash,signal);
    if(cast.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
    if(isArticle(cast))throw new Error('Articles are read-only in Kite. Edit the article in Farcaster.');
    if(attempt?.accepted)api.rememberCast(attempt.prepared.cast);
    return {cast,initial:await readEditDraft(attempt?.prepared.cast||cast,api),attempt};
  },[api,author,hash,session?.fid,session?.key]);
  if(context.loading)return <Loading/>;
  if(context.error||!context.value)return <Notice title="Couldn’t open cast editor" retry={context.reload}>{context.error}</Notice>;
  const edit=context.value;
  if(edit.attempt?.accepted)return <View style={{padding:18,gap:12}}><Notice title="Replacement published"/><Button label="View cast" onPress={()=>router.replace(castRoute(edit.attempt!.prepared.cast))}/></View>;
  return <><Stack.Screen options={{title:'Edit cast'}}/><CastComposer key={`${session!.key}:${hash}`} fid={author} parent={edit.cast.data.castAddBody.parentCastId||undefined} edit={edit}/></>;
}
