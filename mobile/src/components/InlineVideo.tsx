import {useEvent,useEventListener} from 'expo';
import {Image} from 'expo-image';
import {useFocusEffect} from 'expo-router';
import {useVideoPlayer,VideoView,type VideoPlayer} from 'expo-video';
import {useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Platform,Pressable,Text,View} from 'react-native';
import {videoSource} from '../lib/video-source';
import {useApp} from '../lib/state';
import {Icon} from './ui';

let playingPlayer:VideoPlayer|undefined;
export function InlineVideo({url,contentType,poster}:{url:string;contentType?:string;poster?:string}){
  const {colors}=useApp();
  const [started,setStarted]=useState(false),[revision,setRevision]=useState(0),[posterFailed,setPosterFailed]=useState(false);
  const source=videoSource(url,contentType);if(!source)return null;
  return <Pressable accessible={false} focusable={false} onPress={event=>event.stopPropagation()} style={{height:220,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:'#000'}}>
    {started?<Playback key={revision} source={source} retry={()=>setRevision(value=>value+1)}/>:<Pressable accessibilityRole="button" accessibilityLabel="Play video" onPress={event=>{event.stopPropagation();setStarted(true);}} style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      {poster&&!posterFailed&&<Image source={{uri:poster}} onError={()=>setPosterFailed(true)} style={{position:'absolute',width:'100%',height:'100%'}} contentFit="cover"/>}
      <View pointerEvents="none" style={{width:54,height:54,borderRadius:27,backgroundColor:'#00000099',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={25} color="#fff"/></View>
    </Pressable>}
  </Pressable>;
}
function Playback({source,retry}:{source:NonNullable<ReturnType<typeof videoSource>>;retry:()=>void}){
  const player=useVideoPlayer(source,value=>{value.loop=false;value.staysActiveInBackground=false;});
  const {status}=useEvent(player,'statusChange',{status:player.status}),{muted}=useEvent(player,'mutedChange',{muted:player.muted});
  useEventListener(player,'playingChange',({isPlaying})=>{
    if(isPlaying){if(playingPlayer&&playingPlayer!==player)playingPlayer.pause();playingPlayer=player;}
    else if(playingPlayer===player)playingPlayer=undefined;
  });
  useEffect(()=>{player.play();return()=>{if(playingPlayer===player)playingPlayer=undefined;player.pause();};},[player]);
  useFocusEffect(useCallback(()=>()=>{player.pause();},[player]));
  // Native expo-video handles backgrounding and its separate fullscreen activity.
  useEffect(()=>{if(Platform.OS!=='web')return;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>subscription.remove();},[player]);
  function toggleMute(){
    // eslint-disable-next-line react-hooks/immutability -- expo-video uses mutable native player properties for playback controls.
    player.muted=!player.muted;
  }
  return <View style={{flex:1}}>
    {status==='error'?<View style={{flex:1,padding:16,gap:8,alignItems:'center',justifyContent:'center'}}><Text accessibilityRole="alert" style={{color:'#fff',fontSize:14,textAlign:'center'}}>This video couldn’t be played.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={event=>{event.stopPropagation();retry();}} style={{minHeight:44,paddingHorizontal:18,justifyContent:'center',borderRadius:12,backgroundColor:'#262626'}}><Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>Try again</Text></Pressable></View>:<>
      <VideoView accessibilityLabel="Inline cast video" player={player} nativeControls fullscreenOptions={{enable:true}} contentFit="contain" surfaceType="textureView" style={{width:'100%',height:'100%'}}/>
      <Pressable accessibilityRole="button" accessibilityLabel={muted?'Unmute video':'Mute video'} accessibilityState={{selected:muted}} onPress={event=>{event.stopPropagation();toggleMute();}} style={{position:'absolute',right:6,top:6,width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#00000099'}}><Icon name={muted?'volume-x':'volume-2'} size={20} color="#fff"/></Pressable>
    </>}
    {(status==='loading'||status==='idle')&&<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'}}><ActivityIndicator accessibilityLabel="Loading video" color="#fff"/></View>}
  </View>;
}
