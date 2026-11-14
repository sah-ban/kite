import {useEffect,useRef,useState,type ComponentRef} from 'react';
import {ActivityIndicator,Pressable,Text,TextInput,View} from 'react-native';
import {mentionQuery,editMentions} from '../../../src/lib/mentions';
import {type Draft,changeText} from '../lib/composer';
import {useApp} from '../lib/state';
import type {Profile} from '../lib/model';
import {Avatar,space} from './ui';

export function ComposerMentionInput({draft,onChange,disabled=false,reply=false}:{draft:Draft;onChange:(value:Draft)=>void;disabled?:boolean;reply?:boolean}){
  const {api,colors}=useApp(),input=useRef<ComponentRef<typeof TextInput>>(null);
  const [caret,setCaret]=useState(draft.text.length),[focused,setFocused]=useState(false),[candidate,setCandidate]=useState<Profile>(),[checking,setChecking]=useState(false);
  const query=focused?mentionQuery(draft.text,caret):undefined,key=query?`${query.start}:${query.query}`:'';
  const name=query?.query||'';
  useEffect(()=>{
    let active=true;const abort=new AbortController();
    if(!name)return()=>abort.abort();
    const timer=setTimeout(()=>{
      setChecking(true);
      void api.resolveProfile(name,abort.signal).then(fid=>api.profile(fid)).then(person=>{if(active)setCandidate(person.username&&(person.username.toLowerCase()===name||/^\d+$/.test(name))?person:undefined);}).catch(()=>{if(active)setCandidate(undefined);}).finally(()=>{if(active)setChecking(false);});
    },250);
    return()=>{active=false;clearTimeout(timer);abort.abort();};
  },[api,name,key]);
  function choose(person:Profile){
    if(!query||draft.mentions.length>=10)return;
    const label=`@${person.username}`,insert=label+' ',text=draft.text.slice(0,query.start)+insert+draft.text.slice(query.end);
    const end=query.start+label.length;
    const mentions=[...editMentions(draft.text,text,draft.mentions).filter(mention=>mention.end<=query.start||mention.start>=end),{start:query.start,end,fid:person.fid,label}].sort((a,b)=>a.start-b.start);
    onChange({...draft,text,mentions});setCandidate(undefined);setCaret(query.start+insert.length);input.current?.focus();
  }
  const visibleCandidate=query&&candidate&&(candidate.username.toLowerCase()===name||/^\d+$/.test(name))?candidate:undefined;
  return <View style={{gap:10}}>
    <TextInput ref={input} accessibilityLabel="Cast text" multiline autoFocus editable={!disabled} value={draft.text} onChangeText={text=>onChange(changeText(draft,text))} onSelectionChange={event=>setCaret(event.nativeEvent.selection.end)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder={reply?'Write your reply…':'What’s happening?'} placeholderTextColor={colors.muted} textAlignVertical="top" style={{minHeight:150,fontSize:19,lineHeight:27,color:colors.ink,padding:0}}/>
    {query&&!!name&&draft.mentions.length<10&&<View style={{borderWidth:1,borderColor:colors.line,borderRadius:14,backgroundColor:colors.soft,padding:12}}>
      {visibleCandidate?<Pressable accessibilityRole="button" accessibilityLabel={`Mention @${visibleCandidate.username}`} onPress={()=>choose(visibleCandidate)} style={space.row}><Avatar url={visibleCandidate.avatar} size={36}/><View><Text style={{color:colors.ink,fontWeight:'600'}}>{visibleCandidate.name}</Text><Text style={{color:colors.muted,fontSize:13}}>@{visibleCandidate.username}</Text></View></Pressable>:checking?<ActivityIndicator color={colors.accent}/>:<Text style={{color:colors.muted,fontSize:13}}>Type a full username to find an account.</Text>}
    </View>}
    {draft.text.includes('@')&&!query&&<Text style={{fontSize:12,color:colors.muted}}>Select a suggestion to link a mention.</Text>}
  </View>;
}
