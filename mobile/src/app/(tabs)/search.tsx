import {router} from 'expo-router';
import {useEffect,useRef,useState} from 'react';
import {Keyboard,ScrollView,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {parseSearch,castRoute} from '../../lib/model';
import {Button,Field,space} from '../../components/ui';

export default function Search(){
  const {api,colors}=useApp();const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[api]);
  async function search(){
    if(busy)return;Keyboard.dismiss();setError('');const controller=new AbortController();pending.current=controller;setBusy(true);
    try{const target=parseSearch(query);if(target.kind==='profile'){const fid=await api.resolveProfile(target.value,controller.signal);if(!controller.signal.aborted)router.push(`/profile/${fid}`);}else{const cast=await api.resolveCast(target.author,target.hash,controller.signal);if(!controller.signal.aborted)router.push(castRoute(cast));}}
    catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Search failed.');}
    finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={space.content}><View style={{paddingTop:10,gap:8}}><Text style={[space.title,{color:colors.ink}]}>Find your people.</Text><Text style={[space.body,{color:colors.muted}]}>Search by exact username or FID, or paste a cast link.</Text></View><Field value={query} onChangeText={setQuery} placeholder="@username, FID or cast link" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={()=>void search()} accessibilityLabel="Search profiles or casts"/><Button label={busy?'Searching…':'Search Farcaster'} icon="search" disabled={busy||!query.trim()} onPress={()=>void search()}/>{!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:21}}>{error}</Text>}</ScrollView>;
}
