import {feedback} from '../lib/haptics';
import {HapticPressable as Pressable} from './HapticControls';
import {Stack,router,usePreventRemove} from 'expo-router';
import {useHeaderHeight} from 'expo-router/react-navigation';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {ActivityIndicator,Keyboard,KeyboardAvoidingView,Platform,ScrollView,Text,View} from 'react-native';
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
import {DraftCloseDialog} from './DraftCloseDialog';
import type {Cast} from '../lib/model';
import {castKey,castRoute} from '../lib/model';
import type {EditAttempt} from '../lib/cast-edit';

export function CastComposer({fid,parent,quote,edit,storageKey}:{fid:number;storageKey?:string;parent?:CastRef;quote?:CastRef;edit?:{cast:Cast;initial:Draft;attempt?:EditAttempt}}){
  const {api,colors,publish,replaceCast,publishing,accountBusy,deletedCasts}=useApp(),insets=useSafeAreaInsets();
  const headerHeight=useHeaderHeight();
  const [keyboardVisible,setKeyboardVisible]=useState(()=>Keyboard.isVisible());
  const [key]=useState(()=>storageKey||draftKey(fid,api.origin,parent,quote)+(edit?`:edit:${edit.cast.hash}`:`:draft:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`));
  const saved=useSavedDraft(key,edit?.initial||{...emptyDraft(),...(quote?{quote}:{})},!!edit?.attempt);
  const [error,setError]=useState(''),[uploading,setUploading]=useState(false),[gifOpen,setGifOpen]=useState(false),[linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState('');
  const upload=useRef<AbortController|null>(null),sending=useRef(false),closing=useRef(false);
  const reference=useQuery(signal=>parent?api.resolveCast(String(parent.fid),parent.hash,signal):Promise.resolve(undefined),[api,parent?.fid,parent?.hash]);
  const maxBytes=10000,state=usage(saved.draft,maxBytes);
  const [frozen,setFrozen]=useState(!!edit?.attempt),[progress,setProgress]=useState('');
  const originalDeleted=!!edit&&(!!edit.attempt?.deleted||deletedCasts.has(castKey(edit.cast)));
  const [allowLeave,setAllowLeave]=useState(false),[closeRequest,setCloseRequest]=useState<(()=>void)|null>(null),[closeBusy,setCloseBusy]=useState(false),[closeError,setCloseError]=useState('');
  const disableClosePrevention=usePreventRemove(!allowLeave&&(!saved.ready||state.hasContent||publishing||uploading),({repeat})=>{
    if(!saved.ready||publishing)return;
    Keyboard.dismiss();setCloseError('');setCloseRequest(previous=>previous||repeat);
  });
  async function finishClose(discard:boolean){
    if(closing.current||!closeRequest)return;closing.current=true;setCloseBusy(true);setCloseError('');upload.current?.abort();
    try{if(discard)await saved.clear();else await saved.save();feedback('success');setAllowLeave(true);closeRequest();}
    catch(error){feedback('error');setCloseError(error instanceof Error?error.message:'Could not update your draft. Please try again.');}
    finally{closing.current=false;setCloseBusy(false);}
  }
  const disabled=publishing||uploading||accountBusy||!saved.ready||!!closeRequest,locked=disabled||frozen;
  const publishDisabled=locked||!!state.error,attachmentsDisabled=locked||state.embeds>=4;
  useEffect(()=>()=>upload.current?.abort(),[]);
  useEffect(()=>{
    const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',()=>setKeyboardVisible(true));
    const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>setKeyboardVisible(false));
    return()=>{show.remove();hide.remove();};
  },[]);
  async function send(){
    if(disabled||!frozen&&state.error||sending.current)return;sending.current=true;setError('');Keyboard.dismiss();
    try{const input=castInput(saved.draft,parent);const cast=edit?await replaceCast(edit.cast,input,setProgress,()=>setFrozen(true)):await publish(input);await saved.clear().catch(()=>{});setAllowLeave(true);disableClosePrevention();if(edit)router.replace(castRoute(cast));else if(router.canGoBack())router.back();else router.replace('/');}
    catch(error){feedback('error');setError(error instanceof Error?error.message:'Could not publish your cast. Please try again.');}
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
    feedback('success');}catch(error){if(!controller.signal.aborted){feedback('error');setError(error instanceof Error?error.message:'Could not attach your image.');}}
    finally{if(upload.current===controller){upload.current=null;setUploading(false);}}
  }
  function attach(){if(locked)return;try{saved.update(value=>addLink(value,link));setLink('');setLinkOpen(false);setError('');feedback('success');}catch(error){feedback('error');setError(error instanceof Error?error.message:'Check your link.');}}
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:colors.surface}} behavior="padding" keyboardVerticalOffset={headerHeight}>
    <Stack.Screen options={{title:edit?'Edit cast':parent?'Reply':saved.draft.quote?'Quote cast':'New cast',headerLeft:()=> <Pressable accessibilityRole="button" accessibilityLabel="Close composer" disabled={publishing||closeBusy} onPress={()=>router.canGoBack()?router.back():router.replace('/')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x"/></Pressable>,headerRight:()=> <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Pressable accessibilityRole="button" accessibilityLabel="Open saved drafts" onPress={()=>router.replace('/drafts')} disabled={publishing||closeBusy} style={({pressed})=>({minWidth:44,minHeight:44,paddingHorizontal:6,alignItems:'center',justifyContent:'center',opacity:publishing||closeBusy?.45:pressed?.65:1})}><Text style={{color:colors.accent,fontSize:13,fontWeight:'600'}}>Drafts</Text></Pressable>{!edit&&<Pressable accessibilityRole="button" accessibilityLabel="Publish cast" accessibilityState={{disabled:publishDisabled,busy:publishing}} disabled={publishDisabled} onPress={()=>void send()} style={({pressed})=>({minWidth:78,minHeight:44,paddingHorizontal:18,borderRadius:22,marginRight:6,flexDirection:'row',gap:8,justifyContent:'center',alignItems:'center',backgroundColor:publishDisabled?colors.soft:colors.accent,opacity:pressed?.75:1})}>{publishing&&<ActivityIndicator size="small" color={colors.muted}/>}<Text style={{color:publishDisabled?colors.muted:colors.background,fontSize:15,fontWeight:'700'}}>{publishing?'Publishing…':'Cast'}</Text></Pressable>}</View>}}/>
    <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{paddingHorizontal:20,paddingTop:20,paddingBottom:24,gap:20,flexGrow:1}}>
      {edit&&<EditCastSummary cast={edit.cast} frozen={frozen} deleted={originalDeleted}/>}
      {parent&&<View style={{padding:12,borderRadius:14,backgroundColor:colors.soft,gap:8}}><Text style={{fontSize:12,color:colors.muted}}>Replying to</Text><Person fid={parent.fid} compact/>{reference.value&&<CastText cast={reference.value} limit={180}/>}</View>}
      <View style={space.row}><Person fid={fid} profileLink={false}/></View>
      {!saved.ready?<Loading/>:<ComposerMentionInput draft={saved.draft} onChange={saved.update} disabled={locked} reply={!!parent}/>}
      <ComposeAttachments draft={saved.draft} update={saved.update} disabled={locked}/>
      {linkOpen&&<View style={{padding:16,borderRadius:18,backgroundColor:colors.soft,gap:12}}><View style={space.row}><Icon name="link" size={16} color={colors.accent}/><Text style={{flex:1,fontSize:14,fontWeight:'600',color:colors.ink}}>Attach a link</Text><Pressable accessibilityRole="button" accessibilityLabel="Close link input" onPress={()=>setLinkOpen(false)} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={18}/></Pressable></View><View style={space.row}><Field value={link} onChangeText={setLink} placeholder="https://example.com" accessibilityLabel="Link to embed" editable={!locked} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{flex:1,minWidth:0}} onSubmitEditing={attach}/><Button label="Attach" disabled={locked||!link.trim()} onPress={attach}/></View></View>}
      {!!(error||saved.error)&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:14,lineHeight:21}}>{error||saved.error}</Text>}
      {state.hasContent&&!!state.error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:13,lineHeight:20}}>{state.error}</Text>}
      {edit&&<Button label={publishing?(progress||'Working…'):frozen?(originalDeleted?'Retry cast publication':'Retry delete and cast again'):'Delete previous and cast again'} disabled={disabled||!frozen&&!!state.error} onPress={()=>void send()}/>}
      {uploading&&<View style={space.row}><ActivityIndicator color={colors.accent}/><Text style={{color:colors.muted,fontSize:13}}>Uploading image…</Text></View>}
    </ScrollView>
    <View style={{flexShrink:0,borderTopWidth:1,borderColor:colors.line,paddingHorizontal:12,paddingTop:4,paddingBottom:keyboardVisible?4:Math.max(insets.bottom,4),backgroundColor:colors.surface}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
        <ComposerTool label="Add image" icon="image" disabled={attachmentsDisabled} onPress={()=>void photos()}/>
        <ComposerTool label="Choose a GIF" disabled={attachmentsDisabled} onPress={()=>{Keyboard.dismiss();setGifOpen(true);}}/>
        <ComposerTool label="Attach link" icon="link" selected={linkOpen} disabled={attachmentsDisabled} onPress={()=>setLinkOpen(value=>!value)}/>
        <View style={{flex:1,alignItems:'flex-end'}}>
          <View style={{gap:5}}>
            <View accessible accessibilityRole="progressbar" accessibilityLabel="Cast text limit" accessibilityValue={{min:0,max:maxBytes,now:Math.min(state.bytes,maxBytes),text:`${state.bytes.toLocaleString()} of ${maxBytes.toLocaleString()} text bytes`}} style={{height:4,borderRadius:2,backgroundColor:colors.line,overflow:'hidden'}}>
              <View style={{width:`${Math.min(100,state.bytes/maxBytes*100)}%`,height:4,borderRadius:2,backgroundColor:state.bytes>=maxBytes*.9?colors.danger:colors.accent}}/>
            </View>
            <Text accessibilityLabel={`${state.embeds} of 4 embeds used`} style={{fontSize:11,color:state.embeds>=4?colors.accent:colors.muted}}>{state.embeds}/4 embeds</Text>
          </View>
        </View>
      </View>
    </View>
    {closeRequest&&<DraftCloseDialog busy={closeBusy} error={closeError} onSave={()=>void finishClose(false)} onDiscard={()=>void finishClose(true)} onCancel={()=>{setCloseRequest(null);setCloseError('');}}/>}
    {gifOpen&&<GifPicker onClose={()=>setGifOpen(false)} onSelect={url=>{if(locked)return;try{saved.update(value=>addImage(value,url));setGifOpen(false);setError('');}catch(error){setError(error instanceof Error?error.message:'Could not attach this GIF.');}}}/>}
  </KeyboardAvoidingView>;
}

function ComposerTool({label,icon,disabled,selected=false,onPress}:{label:string;icon?:ComponentProps<typeof Icon>['name'];disabled:boolean;selected?:boolean;onPress:()=>void}){
  const {colors}=useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,...(icon==='link'?{expanded:selected}:{})}} disabled={disabled} onPress={onPress} style={({pressed})=>({width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:selected?colors.accentSoft:'transparent',borderWidth:1,borderColor:selected?colors.accent:'transparent',opacity:disabled?.35:pressed?.65:1})}>{icon?<Icon name={icon} size={21} color={colors.accent}/>:<Text style={{fontSize:12,fontWeight:'800',color:colors.accent}}>GIF</Text>}</Pressable>;
}
