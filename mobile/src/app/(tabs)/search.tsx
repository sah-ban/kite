import {feedback} from '../../lib/haptics';
import {HapticPressable as Pressable} from '../../components/HapticControls';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {router,Tabs} from 'expo-router';
import {useEffect,useRef,useState,type ComponentRef} from 'react';
import {ActivityIndicator,Keyboard,ScrollView,Text,TextInput,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../../lib/state';
import {parseSearch,castRoute} from '../../lib/model';
import {readSearchHistory,rememberSearch,searchEntry} from '../../lib/search-history';
import {AccountButton} from '../../components/AccountButton';
import {Icon} from '../../components/ui';

export default function Search(){
  const {api,account}=useApp(),scope=`kite.mobile.search.v1:${api.origin}:${account.session?.fid||0}`;
  return <SearchScreen key={scope} storageKey={scope}/>;
}
function SearchScreen({storageKey}:{storageKey:string}){
  const {api,colors}=useApp(),insets=useSafeAreaInsets();
  const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[focused,setFocused]=useState(false);
  const [recent,setRecent]=useState<string[]>([]),[ready,setReady]=useState(false),[pasting,setPasting]=useState(false);
  const input=useRef<ComponentRef<typeof TextInput>>(null),pending=useRef<AbortController|null>(null),alive=useRef(false),revision=useRef(0),writes=useRef(Promise.resolve());
  useEffect(()=>{
    alive.current=true;
    AsyncStorage.getItem(storageKey).then(value=>{if(alive.current)setRecent(readSearchHistory(value));}).catch(()=>{/* Search still works without saved history. */}).finally(()=>{if(alive.current)setReady(true);});
    return ()=>{alive.current=false;pending.current?.abort();};
  },[storageKey]);
  function saveHistory(value:string[]){
    setRecent(value);
    writes.current=writes.current.then(()=>AsyncStorage.setItem(storageKey,JSON.stringify(value))).catch(()=>{/* Keep this session’s history if storage is unavailable. */});
  }
  function changeQuery(value:string){revision.current++;setQuery(value);setError('');}
  async function paste(){
    if(pasting)return;
    const version=revision.current;setPasting(true);setError('');
    try{const value=(await Clipboard.getStringAsync()).trim();if(alive.current&&version===revision.current){if(value){changeQuery(value);input.current?.focus();}else setError('Your clipboard is empty. Copy a username or cast link first.');}}
    catch{if(alive.current)setError('Could not paste. Touch and hold the search field to paste instead.');}
    finally{if(alive.current)setPasting(false);}
  }
  async function search(value=query){
    if(pending.current||!value.trim()||!ready)return;
    feedback('light');changeQuery(value);Keyboard.dismiss();const controller=new AbortController();pending.current=controller;setBusy(true);
    try{
      const entry=searchEntry(value),target=parseSearch(entry.query);
      const path=target.kind==='profile'?`/profile/${await api.resolveProfile(target.value,controller.signal)}` as const:castRoute(await api.resolveCast(target.author,target.hash,controller.signal));
      if(!controller.signal.aborted&&alive.current){saveHistory(rememberSearch(recent,entry.query));router.push(path);}
    }catch(error){if(!controller.signal.aborted&&alive.current)setError(error instanceof Error?error.message:'Search failed. Please try again.');}
    finally{if(pending.current===controller){pending.current=null;if(alive.current)setBusy(false);}}
  }
  let hint='Enter an exact username, FID, or paste a profile or cast link.';
  if(query.trim())try{hint=searchEntry(query).kind==='cast'?'Open this cast and its conversation.':'Open this Farcaster profile.';}catch{hint='Use an exact username, FID, or a Kite or Farcaster link.';}
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.surface}}>
    <Tabs.Screen options={{headerShown:false}}/>
    <View style={{height:56,flexDirection:'row',alignItems:'center'}}><AccountButton side="left"/><View pointerEvents="none" style={{position:'absolute',left:70,right:70,alignItems:'center'}}><Text style={{color:colors.ink,fontSize:22,fontWeight:'700',letterSpacing:-.6}}>Search</Text></View></View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{paddingHorizontal:16,paddingTop:10,paddingBottom:24,gap:24}}>
      <View style={{gap:9}}>
        <View style={{flexDirection:'row',alignItems:'center',paddingLeft:14,paddingRight:4,minHeight:54,borderRadius:16,borderWidth:1,borderColor:focused?colors.accent:colors.line,backgroundColor:colors.soft}}>
          <Icon name="search" color={colors.muted}/>
          <TextInput ref={input} value={query} onChangeText={changeQuery} editable={!busy} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder="Username, FID or cast link" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} autoComplete="off" returnKeyType="search" onSubmitEditing={()=>void search()} accessibilityLabel="Search profiles or casts" selectionColor={colors.accent} underlineColorAndroid="transparent" style={{flex:1,minWidth:0,minHeight:52,paddingHorizontal:10,paddingVertical:10,color:colors.ink,fontSize:15}}/>
          {busy?<ActivityIndicator accessibilityLabel="Searching" color={colors.accent} style={{width:44,height:44}}/>:<>
            {query.length>0?<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>{changeQuery('');input.current?.focus();}} style={iconButton}><Icon name="x" size={18} color={colors.muted}/></Pressable>:<Pressable accessibilityRole="button" accessibilityLabel="Paste from clipboard" disabled={pasting} onPress={()=>void paste()} style={iconButton}>{pasting?<ActivityIndicator size="small" color={colors.muted}/>:<Icon name="clipboard" size={18} color={colors.muted}/>}</Pressable>}
            {!!query.trim()&&<Pressable accessibilityRole="button" accessibilityLabel="Search Farcaster" accessibilityState={{disabled:!ready}} disabled={!ready} onPress={()=>void search()} style={[iconButton,{backgroundColor:colors.accent,borderRadius:12}]}><Icon name="arrow-right" size={20} color={colors.background}/></Pressable>}
          </>}
        </View>
        <Text style={{fontSize:13,lineHeight:18,color:colors.muted}}>{hint}</Text>
        {!!error&&<View accessibilityRole="alert" style={{flexDirection:'row',gap:8,padding:12,borderRadius:12,backgroundColor:colors.soft}}><Icon name="alert-circle" size={17} color={colors.danger}/><Text style={{flex:1,color:colors.danger,fontSize:13,lineHeight:19}}>{error}</Text></View>}
      </View>
      {!ready?<ActivityIndicator accessibilityLabel="Loading recent searches" color={colors.muted}/>:recent.length>0?<View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4}}><Text style={{fontSize:15,fontWeight:'600',color:colors.ink}}>Recent searches</Text><Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" disabled={busy} onPress={()=>saveHistory([])} style={{minHeight:44,justifyContent:'center',paddingLeft:16}}><Text style={{fontSize:13,color:colors.accent}}>Clear all</Text></Pressable></View>
        {recent.map(value=>{const entry=searchEntry(value);return <View key={entry.key} style={{flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.line}}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${entry.kind==='cast'?'cast':'profile'} ${entry.label}`} disabled={busy} onPress={()=>void search(value)} style={({pressed})=>({flex:1,minWidth:0,minHeight:68,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,opacity:pressed?.6:1})}><View style={{width:38,height:38,borderRadius:12,backgroundColor:colors.soft,alignItems:'center',justifyContent:'center'}}><Icon name={entry.kind==='cast'?'message-square':'user'} size={18} color={colors.muted}/></View><View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} style={{fontSize:15,fontWeight:'500',color:colors.ink}}>{entry.label}</Text><Text style={{fontSize:12,color:colors.muted}}>{entry.kind==='cast'?'Cast':'Profile'}</Text></View></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${entry.label} from recent searches`} disabled={busy} onPress={()=>saveHistory(recent.filter(item=>item!==value))} style={iconButton}><Icon name="x" size={16} color={colors.muted}/></Pressable>
        </View>;})}
        <Text style={{marginTop:12,fontSize:12,color:colors.muted}}>Saved only on this device.</Text>
      </View>:<View style={{gap:20,paddingTop:4}}>
        <View style={{flexDirection:'row',gap:12}}><Icon name="user" color={colors.muted}/><View style={{flex:1,gap:4}}><Text style={{fontSize:15,fontWeight:'600',color:colors.ink}}>Find a profile</Text><Text style={{fontSize:13,lineHeight:19,color:colors.muted}}>Use an exact @username, an ENS name, or a numeric FID.</Text></View></View>
        <View style={{flexDirection:'row',gap:12}}><Icon name="message-square" color={colors.muted}/><View style={{flex:1,gap:4}}><Text style={{fontSize:15,fontWeight:'600',color:colors.ink}}>Open a conversation</Text><Text style={{fontSize:13,lineHeight:19,color:colors.muted}}>Paste a cast link from Kite or Farcaster to read the full conversation.</Text></View></View>
      </View>}
    </ScrollView>
  </View>;
}
const iconButton={width:44,height:44,alignItems:'center' as const,justifyContent:'center' as const};
