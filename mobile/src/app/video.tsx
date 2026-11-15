import {useEvent} from 'expo';
import {router,Stack,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useVideoPlayer,VideoView,type VideoSource} from 'expo-video';
import {useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Platform,Pressable,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {videoSource} from '../lib/video-source';
import {Icon} from '../components/ui';

function close(){if(router.canGoBack())router.back();else router.replace('/');}
function CloseButton(){return <Pressable accessibilityRole="button" accessibilityLabel="Close video" onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={24} color="#fff"/></Pressable>;}
export default function VideoScreen(){
  const {url,contentType}=useLocalSearchParams<{url?:string;contentType?:string}>(),insets=useSafeAreaInsets();
  const source=videoSource(url,contentType),[revision,setRevision]=useState(0);
  return <View style={{flex:1,backgroundColor:'#000',paddingTop:insets.top,paddingBottom:insets.bottom}}>
    <Stack.Screen options={{headerShown:false,presentation:'fullScreenModal',contentStyle:{backgroundColor:'#000'}}}/><StatusBar style="light"/>
    {source?<Playback key={`${source.uri}:${revision}`} source={source} retry={()=>setRevision(value=>value+1)}/>:<><View style={{height:56,paddingHorizontal:10,justifyContent:'center'}}><CloseButton/></View><View style={{flex:1,justifyContent:'center',padding:24}}><Text accessibilityRole="alert" style={{color:'#fff',fontSize:16,textAlign:'center'}}>This video link is unavailable.</Text></View></>}
  </View>;
}
function Playback({source,retry}:{source:VideoSource;retry:()=>void}){
  const player=useVideoPlayer(source,value=>{value.loop=true;value.staysActiveInBackground=false;});
  const {status}=useEvent(player,'statusChange',{status:player.status});
  const {muted}=useEvent(player,'mutedChange',{muted:player.muted});
  useFocusEffect(useCallback(()=>{player.play();return()=>{player.pause();};},[player]));
  // Native expo-video handles backgrounding and its separate fullscreen activity.
  useEffect(()=>{if(Platform.OS!=='web')return;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>subscription.remove();},[player]);
  function toggleMute(){
    // eslint-disable-next-line react-hooks/immutability -- expo-video exposes mutable native player properties for playback controls.
    player.muted=!player.muted;
  }
  return <>
    <View style={{height:56,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><CloseButton/><Text style={{color:'#fff',fontSize:16,fontWeight:'600'}}>Video</Text><Pressable accessibilityRole="button" accessibilityLabel={muted?'Unmute video':'Mute video'} accessibilityState={{selected:muted}} onPress={toggleMute} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name={muted?'volume-x':'volume-2'} size={22} color="#fff"/></Pressable></View>
    <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
      {status==='error'?<View style={{padding:24,gap:16,alignItems:'center'}}><Icon name="video-off" size={32} color="#aaa"/><Text accessibilityRole="alert" style={{color:'#fff',fontSize:16,lineHeight:23,textAlign:'center'}}>This video couldn’t be played. Check your connection and try again.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={retry} style={{minHeight:44,justifyContent:'center',paddingHorizontal:20,borderRadius:12,backgroundColor:'#262626'}}><Text style={{color:'#fff',fontSize:15,fontWeight:'600'}}>Try again</Text></Pressable></View>:<VideoView accessibilityLabel="Cast video player" player={player} nativeControls contentFit="contain" fullscreenOptions={{enable:false}} style={{width:'100%',height:'100%'}}/>}
      {(status==='loading'||status==='idle')&&<View pointerEvents="none" style={{position:'absolute'}}><ActivityIndicator accessibilityLabel="Loading video" color="#fff"/></View>}
    </View>
  </>;
}
