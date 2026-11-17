import AsyncStorage from '@react-native-async-storage/async-storage';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useState} from 'react';
import {Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {editKey,readEditAttempt,type EditAttempt} from '../lib/cast-edit';
import {isHash} from '../lib/model';
import {Button} from './ui';

export function PendingCastEdits({onLoaded}:{onLoaded?:(hasContent:boolean)=>void}={}){
  const {api,account,colors}=useApp(),session=account.session;
  const [pending,setPending]=useState<EditAttempt[]>([]),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{
    let active=true;
    if(!session)return;
    void (async()=>{
      const prefix=editKey(api.origin,session.fid,''),keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith(prefix)&&isHash(key.slice(prefix.length)));
      const results=await Promise.allSettled(keys.map(key=>readEditAttempt(AsyncStorage,key,session,key.slice(prefix.length))));
      if(!active)return;
      const items=results.flatMap(result=>result.status==='fulfilled'&&result.value&&!result.value.accepted?[result.value]:[]);
      const error=results.some(result=>result.status==='rejected')?'Some saved edits require the signer that started them.':'';
      setPending(items);setError(error);onLoaded?.(items.length>0||!!error);
    })().catch(()=>{if(active){setError('Could not load saved edits. Open Saved drafts again to retry.');onLoaded?.(true);}});
    return()=>{active=false;};
  },[api,session,onLoaded]));
  if(!session||!pending.length&&!error)return null;
  return <View style={{gap:8}}><Text style={{fontSize:16,fontWeight:'600',color:colors.ink}}>Pending cast edits</Text>{pending.map(attempt=><View key={attempt.source.hash} style={{gap:4}}><Text numberOfLines={2} style={{fontSize:13,color:colors.muted}}>{attempt.source.data.castAddBody.text||'Cast with embeds'}</Text><Button label={attempt.deleted?'Finish cast replacement':'Resume cast edit'} quiet icon="edit-2" onPress={()=>router.push(`/edit/${attempt.source.data.fid}/${attempt.source.hash}`)}/></View>)}{!!error&&<Text style={{fontSize:12,color:colors.muted}}>{error}</Text>}</View>;
}
