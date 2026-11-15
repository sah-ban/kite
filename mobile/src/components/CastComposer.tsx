import {Stack,router} from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {type CastRef,type Draft,MAX_IMAGE_BYTES,addImage,addLink,castInput,draftKey,emptyDraft,usage} from '../lib/composer';
import {useSavedDraft} from '../lib/use-draft';
import {Button,Field,Icon,Loading,space} from './ui';
import {CastText,Person} from './CastCard';
import {ComposerMentionInput} from './ComposerMentionInput';
import {ComposeAttachments} from './ComposeAttachments';
import {GifPicker} from './GifPicker';
import {EditCastSummary} from './EditCastSummary';
import type {Cast} from '../lib/model';
import {castKey,castRoute} from '../lib/model';
import type {EditAttempt} from '../lib/cast-edit';

export function CastComposer({fid,parent,quote,edit}:{fid:number;parent?:CastRef;quote?:CastRef;edit?:{cast:Cast;initial:Draft;attempt?:EditAttempt}}){
  const {api,colors,publish,replaceCast,publishing,accountBusy,deletedCasts}=useApp(),insets=useSafeAreaInsets();
  const saved=useSavedDraft(draftKey(fid,api.origin,parent,quote)+(edit?`:edit:${edit.cast.hash}`:''),edit?.initial||{...emptyDraft(),...(quote?{quote}:{})},!!edit?.attempt);
  const [error,setError]=useState(''),[uploading,setUploading]=useState(false),[gifOpen,setGifOpen]=useState(false),[linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState('');
  const [clock,setClock]=useState(Date.now);
  const upload=useRef<AbortController|null>(null),sending=useRef(false);
  const pro=useQuery(signal=>api.proExpiry(fid,signal),[api,fid]);
  const reference=useQuery(signal=>parent?api.resolveCast(String(parent.fid),parent.hash,signal):Promise.resolve(undefined),[api,parent?.fid,parent?.hash]);
  const expiry=pro.value||0,maxBytes=expiry>clock/1000?10000:1024;
  const state=usage(saved.draft,maxBytes);
  const [frozen,setFrozen]=useState(!!edit?.attempt),[progress,setProgress]=useState('');
  const originalDeleted=!!edit&&(!!edit.attempt?.deleted||deletedCasts.has(castKey(edit.cast)));
  const disabled=publishing||uploading||accountBusy||!saved.ready,locked=disabled||frozen;
  useEffect(()=>()=>upload.current?.abort(),[]);
  useEffect(()=>{
    if(!expiry||expiry*1000<=clock)return;
    const timer=setTimeout(()=>setClock(Date.now()),Math.max(1,Math.min(expiry*1000-Date.now()+1,2147483647)));
    return()=>clearTimeout(timer);
  },[expiry,clock]);
  async function send(){
    if(disabled||!frozen&&state.error||sending.current)return;sending.current=true;setError('');Keyboard.dismiss();
    try{const input=castInput(saved.draft,parent);const cast=edit?await replaceCast(edit.cast,input,setProgress,()=>setFrozen(true)):await publish(input);await saved.clear().catch(()=>{});if(edit)router.replace(castRoute(cast));else if(router.canGoBack())router.back();else router.replace('/');}
    catch(error){setError(error instanceof Error?error.message:'Could not publish your cast. Please try again.');}
    finally{sending.current=false;setProgress('');}
  }
  async function photos(){
    if(locked||state.embeds>=4)return;setError('');Keyboard.dismiss();
    const controller=new AbortController();upload.current=controller;setUploading(true);
    try{
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:4-state.embeds,quality:1});
      if(result.canceled)return;
      for(const asset of result.assets){
        if(controller.signal.aborted)return;
        const file=new File(asset.uri);if(file.size>MAX_IMAGE_BYTES)throw new Error('Images must be 10 MB or smaller.');
        const bytes=await file.bytes();const url=await api.uploadImage(bytes,controller.signal);if(controller.signal.aborted)return;
        saved.update(value=>addImage(value,url));
      }
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not attach your image.');}
    finally{if(upload.current===controller){upload.current=null;setUploading(false);}}
  }
  function attach(){if(locked)return;try{saved.update(value=>addLink(value,link));setLink('');setLinkOpen(false);setError('');}catch(error){setError(error instanceof Error?error.message:'Check your link.');}}
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:colors.surface}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <Stack.Screen options={{title:edit?'Edit cast':parent?'Reply':saved.draft.quote?'Quote cast':'New cast',headerRight:edit?undefined:()=> <Pressable accessibilityRole="button" accessibilityLabel="Publish cast" accessibilityState={{disabled:disabled||!!state.error,busy:publishing}} disabled={locked||!!state.error} onPress={()=>void send()} style={{minWidth:72,minHeight:44,marginRight:10,justifyContent:'center',alignItems:'center',opacity:disabled||state.error?.45:1}}><Text style={{color:colors.accent,fontSize:15,fontWeight:'700'}}>{publishing?'Publishing…':'Cast'}</Text></Pressable>}}/>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{padding:18,gap:16,flexGrow:1}}>
      {edit&&<EditCastSummary cast={edit.cast} frozen={frozen} deleted={originalDeleted}/>}
      {parent&&<View style={{padding:12,borderRadius:14,backgroundColor:colors.soft,gap:8}}><Text style={{fontSize:12,color:colors.muted}}>Replying to</Text><Person fid={parent.fid} compact/>{reference.value&&<CastText cast={reference.value} limit={180}/>}</View>}
      <View style={space.row}><Person fid={fid}/></View>
      {!saved.ready?<Loading/>:<ComposerMentionInput draft={saved.draft} onChange={saved.update} disabled={locked} reply={!!parent}/>}
      <ComposeAttachments draft={saved.draft} update={saved.update} disabled={locked}/>
      {linkOpen&&<View style={{gap:8}}><Text style={{fontSize:13,color:colors.muted}}>Link to embed</Text><View style={space.row}><Field value={link} onChangeText={setLink} placeholder="https://example.com" accessibilityLabel="Link to embed" editable={!locked} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{flex:1}} onSubmitEditing={attach}/><Button label="Attach" quiet disabled={locked||!link.trim()} onPress={attach}/></View></View>}
      {!!(error||saved.error)&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:14,lineHeight:21}}>{error||saved.error}</Text>}
      {state.hasContent&&!!state.error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:13,lineHeight:20}}>{state.error}</Text>}
      {edit&&<Button label={publishing?(progress||'Working…'):frozen?(originalDeleted?'Retry cast publication':'Retry delete and cast again'):'Delete previous and cast again'} disabled={disabled||!frozen&&!!state.error} onPress={()=>void send()}/>}
      {uploading&&<View style={space.row}><ActivityIndicator color={colors.accent}/><Text style={{color:colors.muted,fontSize:13}}>Uploading image…</Text></View>}
    </ScrollView>
    <View style={{borderTopWidth:1,borderColor:colors.line,paddingHorizontal:12,paddingTop:6,paddingBottom:Math.max(insets.bottom,8),flexDirection:'row',alignItems:'center'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Add image" disabled={locked||state.embeds>=4} onPress={()=>void photos()} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:locked||state.embeds>=4?.4:1}}><Icon name="image" size={21} color={colors.accent}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose a GIF" disabled={locked||state.embeds>=4} onPress={()=>{Keyboard.dismiss();setGifOpen(true);}} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:locked||state.embeds>=4?.4:1}}><Text style={{fontSize:12,fontWeight:'800',color:colors.accent}}>GIF</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Attach link" disabled={locked||state.embeds>=4} onPress={()=>setLinkOpen(value=>!value)} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:locked||state.embeds>=4?.4:1}}><Icon name="link" size={20} color={colors.accent}/></Pressable>
      <View style={{flex:1,alignItems:'flex-end',paddingRight:6,gap:3}}><Text accessibilityLabel={`${state.bytes} of ${maxBytes} text bytes`} style={{fontSize:11,color:state.bytes>maxBytes?colors.danger:colors.muted}}>{state.bytes.toLocaleString()}/{maxBytes.toLocaleString()} bytes</Text><Text style={{fontSize:11,color:colors.muted}}>{state.embeds}/4 embeds</Text></View>
    </View>
    {gifOpen&&<GifPicker onClose={()=>setGifOpen(false)} onSelect={url=>{if(locked)return;try{saved.update(value=>addImage(value,url));setGifOpen(false);setError('');}catch(error){setError(error instanceof Error?error.message:'Could not attach this GIF.');}}}/>}
  </KeyboardAvoidingView>;
}
