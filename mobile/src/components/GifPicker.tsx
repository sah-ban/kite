import {Image} from 'expo-image';
import {useEffect,useState} from 'react';
import {FlatList,Modal,Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {Button,Field,Icon,Loading,Notice,space} from './ui';
type Gif={id:string;url:string;preview:string;title:string};
export function GifPicker({onSelect,onClose}:{onSelect:(url:string)=>void;onClose:()=>void}){
  const {api,colors}=useApp();
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursor,setCursor]=useState(''),[items,setItems]=useState<Gif[]>([]),[next,setNext]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    void Promise.resolve().then(async()=>{
      if(abort.signal.aborted)return;setBusy(true);setError('');
      try{const result=await api.gifs(search,cursor,abort.signal);if(!abort.signal.aborted){setItems(previous=>[...new Map([...(cursor?previous:[]),...result.items].map(gif=>[gif.id,gif])).values()]);setNext(result.next);}}
      catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Could not load GIFs.');}
      finally{if(!abort.signal.aborted)setBusy(false);}
    });
    return()=>abort.abort();
  },[api,search,cursor,revision]);
  function find(){setItems([]);setNext('');setSearch(query.trim());setCursor('');setRevision(value=>value+1);}
  return <Modal visible onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet"><SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <View style={[space.content,{paddingBottom:12,gap:12}]}><View style={space.row}><Text style={[space.heading,{color:colors.ink,flex:1}]}>Choose a GIF</Text><Pressable accessibilityRole="button" accessibilityLabel="Close GIF picker" onPress={onClose} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x"/></Pressable></View><View style={space.row}><Field value={query} onChangeText={setQuery} placeholder="Search GIFs" accessibilityLabel="Search GIFs" maxLength={100} onSubmitEditing={find} returnKeyType="search" style={{flex:1}}/><Button label="Search" quiet onPress={find}/></View></View>
    <FlatList data={items} keyExtractor={gif=>gif.id} numColumns={2} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:14}} renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={`Attach ${item.title||'GIF'}`} onPress={()=>onSelect(item.url)} style={{flex:1,margin:4,height:150,borderRadius:12,overflow:'hidden',maxWidth:'50%',backgroundColor:colors.soft}}><Image source={{uri:item.preview}} style={{width:'100%',height:'100%'}} contentFit="cover"/></Pressable>}
      ListEmptyComponent={busy?<Loading/>:!error?<Notice title="No GIFs found">Try another search.</Notice>:undefined}
      ListFooterComponent={<View style={{padding:14,gap:12}}>{!!error&&<Notice title="Couldn’t load GIFs" retry={()=>setRevision(value=>value+1)}>{error}</Notice>}{busy&&items.length>0&&<Loading/>}{!!next&&!busy&&<Button label="Load more" quiet onPress={()=>setCursor(next)}/>}<Text style={{color:colors.muted,textAlign:'center',fontSize:12}}>Powered by Tenor</Text></View>}/>
  </SafeAreaView></Modal>;
}
