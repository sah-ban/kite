import {feedback} from '../lib/haptics';
import {HapticPressable as Pressable} from '../components/HapticControls';
import {Image} from 'expo-image';
import {router,Stack,useLocalSearchParams} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {safeLink} from '../lib/model';
import {galleryEmbeds,resolveGallery} from '../lib/image-gallery';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Icon} from '../components/ui';
import {downloadImage} from '../lib/download-image';
import {ImageSaveCancelledError,ImageSavePermissionError} from '../lib/download-image-core';

export default function ImageScreen(){
  const {url,source,embeds}=useLocalSearchParams<{url?:string;source?:string;embeds?:string}>(),{api}=useApp();
  const selected=typeof url==='string'?safeLink(url):undefined;
  const gallery=useQuery(()=>selected?resolveGallery(galleryEmbeds(embeds),typeof source==='string'?safeLink(source):undefined,selected,value=>api.embed(value)):Promise.resolve([]),[api,selected,source,embeds]);
  const images=gallery.value||(selected?[selected]:[]);
  return <ImageViewer key={JSON.stringify(images)} images={images} selected={selected} loadingGallery={gallery.loading}/>;
}
function ImageViewer({images,selected,loadingGallery}:{images:string[];selected?:string;loadingGallery:boolean}){
  const insets=useSafeAreaInsets(),list=useRef<FlatList<string>>(null);
  const [index,setIndex]=useState(()=>Math.max(0,images.indexOf(selected||''))),[notice,setNotice]=useState('');
  const [size,setSize]=useState({width:0,height:0});
  const [downloading,setDownloading]=useState(false),downloadLock=useRef(false);
  const url=images[index];
  function close(){if(router.canGoBack())router.back();else router.replace('/');}
  async function download(){
    if(!url||downloadLock.current)return;downloadLock.current=true;setDownloading(true);setNotice('');
    try{setNotice(await downloadImage(url));feedback('success');}
    catch(error){if(!(error instanceof ImageSaveCancelledError)){feedback('error');setNotice(error instanceof ImageSavePermissionError?error.message:'Couldn’t download this image. Please try again.');}}
    finally{downloadLock.current=false;setDownloading(false);}
  }
  function go(next:number){list.current?.scrollToIndex({index:next,animated:true});setIndex(next);setNotice('');}
  return <View style={{flex:1,backgroundColor:'#000',paddingTop:insets.top,paddingBottom:insets.bottom}}>
    <Stack.Screen options={{headerShown:false,presentation:'fullScreenModal',contentStyle:{backgroundColor:'#000'}}}/>
    <StatusBar style="light"/>
    <View style={{height:56,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={24} color="#fff"/></Pressable>
      <Text accessibilityLiveRegion="polite" style={{color:'#fff',fontSize:16,fontWeight:'600'}}>{images.length>1?`${index+1} / ${images.length}`:'Image'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Download image" accessibilityState={{disabled:!url||downloading,busy:downloading}} disabled={!url||downloading} onPress={()=>void download()} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:url?1:.4}}>{downloading?<ActivityIndicator color="#fff"/>:<Icon name="download" size={21} color="#fff"/>}</Pressable>
    </View>
    <View style={{flex:1}} onLayout={event=>{const {width,height}=event.nativeEvent.layout;setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height});}}>
      {!images.length?<ImagePage/>:size.width>0&&size.height>0&&<FlatList ref={list} key={`${size.width}:${size.height}`} accessibilityLabel="Cast images" data={images} horizontal pagingEnabled showsHorizontalScrollIndicator={false} initialScrollIndex={index} initialNumToRender={4} getItemLayout={(_,position)=>({length:size.width,offset:size.width*position,index:position})} keyExtractor={item=>item} renderItem={({item,index:position})=><View style={{width:size.width,height:size.height}}><ImagePage url={item} position={position+1}/></View>} scrollEventThrottle={16} onScroll={event=>{const next=Math.max(0,Math.min(images.length-1,Math.round(event.nativeEvent.contentOffset.x/size.width)));if(next!==index){setIndex(next);setNotice('');}}}/>}
    </View>
    {images.length>1&&<View style={{height:52,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Pressable accessibilityRole="button" accessibilityLabel="Previous image" disabled={index===0} onPress={()=>go(index-1)} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:index===0?.3:1}}><Icon name="chevron-left" color="#fff"/></Pressable><Text style={{color:'#aaa',fontSize:12}}>Swipe between images</Text><Pressable accessibilityRole="button" accessibilityLabel="Next image" disabled={index===images.length-1} onPress={()=>go(index+1)} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:index===images.length-1?.3:1}}><Icon name="chevron-right" color="#fff"/></Pressable></View>}
    {loadingGallery&&<ActivityIndicator accessibilityLabel="Loading cast images" size="small" color="#aaa" style={{padding:8}}/>}
    {!!notice&&<Text accessibilityRole="alert" style={{position:'absolute',left:18,right:18,bottom:insets.bottom+(images.length>1?60:12),borderRadius:12,backgroundColor:'#262626',color:'#fff',textAlign:'center',fontSize:13,padding:14}}>{notice}</Text>}
  </View>;
}
function ImagePage({url,position=1}:{url?:string;position?:number}){
  const [loading,setLoading]=useState(!!url),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
  return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
    {url&&!failed&&<Image key={revision} source={{uri:url}} accessibilityLabel={`Cast image ${position}`} contentFit="contain" style={{width:'100%',height:'100%'}} onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true);}}/>}
    {url&&loading&&!failed&&<ActivityIndicator accessibilityLabel="Loading image" color="#fff" style={{position:'absolute'}}/>}
    {(!url||failed)&&<View style={{padding:24,gap:16,alignItems:'center'}}><Icon name="image" size={32} color="#aaa"/><Text accessibilityRole="alert" style={{color:'#fff',fontSize:16,textAlign:'center'}}>This image couldn’t be loaded.</Text>{url&&<Pressable accessibilityRole="button" accessibilityLabel="Retry image" onPress={()=>{setFailed(false);setLoading(true);setRevision(value=>value+1);}} style={{minHeight:44,justifyContent:'center',paddingHorizontal:20,borderRadius:12,backgroundColor:'#262626'}}><Text style={{color:'#fff',fontSize:15,fontWeight:'600'}}>Try again</Text></Pressable>}</View>}
  </View>;
}
