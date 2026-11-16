import AsyncStorage from '@react-native-async-storage/async-storage';
import {Stack,router,useFocusEffect} from 'expo-router';
import {useCallback,useState} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import {Image} from 'expo-image';
import {useApp} from '../lib/state';
import {listSavedDrafts,type SavedDraft} from '../lib/drafts';
import {usage} from '../lib/composer';
import {Button,Icon,Loading,Notice,space} from '../components/ui';

export default function DraftsRoute(){
  const {account,api}=useApp(),fid=account.session?.fid;
  return <DraftsList key={`${api.origin}:${fid||0}`} fid={fid}/>;
}
function DraftsList({fid}:{fid?:number}){
  const {api,colors}=useApp();
  const [items,setItems]=useState<SavedDraft[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[remove,setRemove]=useState(''),[deleting,setDeleting]=useState(false),[revision,setRevision]=useState(0);
  useFocusEffect(useCallback(()=>{
    let active=true;
    if(!fid)return;
    void listSavedDrafts(AsyncStorage,fid,api.origin).then(value=>{if(active){setItems(value);setError('');}}).catch(()=>{if(active)setError('Could not load your drafts. Please try again.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
    // Retry must rerun the loader even when the account and server are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fid,api.origin,revision]));
  async function discard(key:string){
    if(deleting)return;setDeleting(true);setError('');
    try{await AsyncStorage.removeItem(key);setItems(value=>value.filter(item=>item.key!==key));setRemove('');}
    catch{setError('Could not discard this draft. Please try again.');}
    finally{setDeleting(false);}
  }
  function open(item:SavedDraft){
    if(item.editHash)router.push({pathname:'/edit/[fid]/[hash]',params:{fid:String(fid),hash:item.editHash}});
    else router.push({pathname:'/compose',params:{draftKey:item.key}});
  }
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <Stack.Screen options={{title:'Saved drafts',headerRight:()=>fid?<Pressable accessibilityRole="button" accessibilityLabel="Write a new cast" onPress={()=>router.push('/compose')} style={{width:44,height:44,alignItems:'center',justifyContent:'center',marginRight:8}}><Icon name="edit-3" color={colors.accent}/></Pressable>:null}}/>
    {!fid?<Notice title="Sign in to view drafts">Your drafts are saved on this device for each account.</Notice>:loading?<Loading/>:<FlatList data={items} keyExtractor={item=>item.key} contentContainerStyle={{padding:16,gap:12,flexGrow:1}}
      ListHeaderComponent={<View style={{gap:8,paddingBottom:8}}><Text style={{fontSize:14,lineHeight:21,color:colors.muted}}>Your unfinished casts, ready when you are.</Text>{!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:14,lineHeight:21}}>{error}</Text>}{!!error&&<Button label="Retry" quiet onPress={()=>setRevision(value=>value+1)}/>}</View>}
      ListEmptyComponent={!error?<Notice icon="file-text" title="No saved drafts">Save a cast as a draft and finish it here later.</Notice>:undefined}
      renderItem={({item})=>{
        const embeds=usage(item.draft,10000).embeds;
        return <View style={{padding:16,borderRadius:18,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,gap:12}}>
          <View style={space.row}><View style={{flex:1,flexDirection:'row',alignItems:'center',gap:6}}><Icon name={item.editHash?'edit-2':item.parent?'message-circle':item.draft.quote?'repeat':'file-text'} size={14} color={colors.accent}/><Text style={{color:colors.accent,fontSize:12,fontWeight:'600'}}>{item.editHash?'Edited cast':item.parent?'Reply':item.draft.quote?'Quote cast':'Cast'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Discard draft" disabled={deleting} onPress={()=>setRemove(item.key)} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="trash-2" size={17} color={colors.muted}/></Pressable></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Continue draft: ${item.draft.text.slice(0,80)||'Cast with attachments'}`} disabled={deleting} onPress={()=>open(item)} style={{gap:12}}>
            <Text numberOfLines={4} style={{fontSize:16,lineHeight:23,color:colors.ink}}>{item.draft.text||'Cast with attachments'}</Text>
            {!!item.draft.images[0]&&<Image source={{uri:item.draft.images[0]}} style={{width:72,height:72,borderRadius:10,backgroundColor:colors.soft}} contentFit="cover" autoplay={false}/>}
            <View style={space.row}><Text style={{flex:1,color:colors.muted,fontSize:12}}>{item.updatedAt?new Date(item.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Saved on this device'}{embeds?` · ${embeds} ${embeds===1?'embed':'embeds'}`:''}</Text><Text style={{fontSize:13,fontWeight:'600',color:colors.accent}}>Continue</Text><Icon name="arrow-right" size={15} color={colors.accent}/></View>
          </Pressable>
          {remove===item.key&&<View style={{borderTopWidth:1,borderColor:colors.line,paddingTop:12,gap:10}}><Text style={{fontSize:14,color:colors.ink}}>Discard this draft? This can’t be undone.</Text><View style={space.row}><Button label={deleting?'Discarding…':'Discard'} disabled={deleting} onPress={()=>void discard(item.key)}/><Button label="Keep draft" quiet disabled={deleting} onPress={()=>setRemove('')}/></View></View>}
        </View>;
      }}/>}
  </View>;
}
