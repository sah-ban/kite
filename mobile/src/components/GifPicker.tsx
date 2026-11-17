import {HapticPressable as Pressable} from './HapticControls';
import {Image} from 'expo-image';
import {useCallback,useEffect,useMemo,useRef,useState,type ComponentRef} from 'react';
import {Keyboard,KeyboardAvoidingView,Modal,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {Field,Icon,Loading,Notice,space} from './ui';

type Gif={id:string;url:string;preview:string;title:string};
export function GifPicker({onSelect,onClose}:{onSelect:(url:string)=>void;onClose:()=>void}){
  const {api,colors}=useApp();
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursor,setCursor]=useState(''),[items,setItems]=useState<Gif[]>([]),[next,setNext]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const list=useRef<ComponentRef<typeof ScrollView>>(null),loading=useRef(true),requested=useRef(new Set<string>());
  const viewport=useRef({height:0,contentHeight:0,offset:0});
  const columns=useMemo(()=>{
    const result:Gif[][]=[[],[],[]];items.forEach((gif,index)=>result[index%3].push(gif));return result;
  },[items]);
  useEffect(()=>{
    const abort=new AbortController();
    loading.current=true;
    if(!cursor){requested.current.clear();viewport.current.offset=0;list.current?.scrollTo({y:0,animated:false});}
    void Promise.resolve().then(async()=>{
      if(abort.signal.aborted)return;setBusy(true);setError('');
      try{const result=await api.gifs(search,cursor,abort.signal);if(!abort.signal.aborted){setItems(previous=>[...new Map([...(cursor?previous:[]),...result.items].map(gif=>[gif.id,gif])).values()]);setNext(result.next);}}
      catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Could not load GIFs.');}
      finally{if(!abort.signal.aborted){loading.current=false;setBusy(false);}}
    });
    return()=>abort.abort();
  },[api,search,cursor,revision]);
  useEffect(()=>{
    if(query.trim()===search)return;
    const timer=setTimeout(()=>{setItems([]);setNext('');setBusy(true);setSearch(query.trim());setCursor('');},300);
    return()=>clearTimeout(timer);
  },[query,search]);
  const loadMore=useCallback(()=>{
    const {height,contentHeight,offset}=viewport.current;
    if(loading.current||busy||error||!next||requested.current.has(next)||query.trim()!==search||!height||!contentHeight||contentHeight-offset-height>240)return;
    loading.current=true;requested.current.add(next);setBusy(true);setCursor(next);
  },[busy,error,next,query,search]);
  useEffect(()=>{loadMore();},[loadMore]);
  function find(value=query){setItems([]);setNext('');setBusy(true);setQuery(value);setSearch(value.trim());setCursor('');setRevision(value=>value+1);}
  function select(url:string){Keyboard.dismiss();onSelect(url);}
  return <Modal visible onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={{flex:1,backgroundColor:colors.surface}}>
      <KeyboardAvoidingView behavior="padding" style={{flex:1}}>
        <View style={{paddingHorizontal:16,paddingTop:8,paddingBottom:12,gap:12}}>
          <View style={space.row}>
            <Text style={{flex:1,fontSize:20,fontWeight:'700',letterSpacing:-.4,color:colors.ink}}>Choose a GIF</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close GIF picker" onPress={onClose} style={({pressed})=>({width:44,height:44,borderRadius:22,backgroundColor:colors.soft,alignItems:'center',justifyContent:'center',opacity:pressed?.65:1})}><Icon name="x" size={20}/></Pressable>
          </View>
          <View style={{flexDirection:'row',alignItems:'center',borderRadius:14,backgroundColor:colors.soft,paddingLeft:14,paddingRight:4}}>
            <Icon name="search" size={19} color={colors.muted}/>
            <Field value={query} onChangeText={setQuery} placeholder="Search GIFs" accessibilityLabel="Search GIFs" maxLength={100} autoCapitalize="none" autoCorrect={false} onSubmitEditing={()=>{Keyboard.dismiss();find();}} returnKeyType="search" style={{flex:1,minWidth:0,minHeight:46,borderWidth:0,backgroundColor:'transparent',paddingHorizontal:10}}/>
            {!!query&&<Pressable accessibilityRole="button" accessibilityLabel="Clear GIF search" onPress={()=>find('')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x-circle" size={18} color={colors.muted}/></Pressable>}
          </View>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <Text numberOfLines={1} style={{flex:1,fontSize:12,fontWeight:'600',color:colors.muted}}>{search?`Results for “${search}”`:'Trending GIFs'}</Text>
            <Text style={{fontSize:11,color:colors.muted}}>Powered by Tenor</Text>
          </View>
        </View>
        <ScrollView ref={list} style={{flex:1}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={100}
          onLayout={event=>{viewport.current.height=event.nativeEvent.layout.height;loadMore();}}
          onContentSizeChange={(_,height)=>{viewport.current.contentHeight=height;loadMore();}}
          onScroll={event=>{viewport.current.offset=event.nativeEvent.contentOffset.y;loadMore();}}
          contentContainerStyle={{paddingHorizontal:8,paddingBottom:16}}>
          <View style={{flexDirection:'row',alignItems:'flex-start',gap:4}}>
            {columns.map((column,index)=><View key={index} style={{flex:1,gap:4}}>{column.map(gif=><GifTile key={gif.id} gif={gif} onSelect={select}/>)}</View>)}
          </View>
          {busy&&<Loading/>}
          {!busy&&!error&&items.length===0&&<Notice icon="search" title="No GIFs found">Try another word or phrase.</Notice>}
          {!!error&&<Notice title="Couldn’t load GIFs" retry={()=>{setBusy(true);setRevision(value=>value+1);}}>{error}</Notice>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function GifTile({gif,onSelect}:{gif:Gif;onSelect:(url:string)=>void}){
  const {colors}=useApp();
  const [ratio,setRatio]=useState(1),[failed,setFailed]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Attach ${gif.title||'GIF'}`} onPress={()=>onSelect(gif.url)} style={({pressed})=>({width:'100%',aspectRatio:ratio,minHeight:44,borderRadius:6,overflow:'hidden',backgroundColor:colors.soft,opacity:pressed?.65:1})}>
    {failed?<View style={{flex:1,padding:8,alignItems:'center',justifyContent:'center',gap:6}}><Icon name="image" size={20} color={colors.muted}/><Text numberOfLines={2} style={{fontSize:11,color:colors.muted,textAlign:'center'}}>{gif.title||'GIF'}</Text></View>:<Image source={{uri:gif.preview}} style={{width:'100%',height:'100%'}} contentFit="contain" onLoad={({source})=>{if(source.width>0&&source.height>0)setRatio(source.width/source.height);}} onError={()=>setFailed(true)}/>}
  </Pressable>;
}
