import {useEvent,useEventListener} from 'expo';
import {Image} from 'expo-image';
import {StatusBar} from 'expo-status-bar';
import {useFocusEffect} from 'expo-router';
import {useVideoPlayer,VideoView} from 'expo-video';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Platform,Pressable,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {videoSource} from '../lib/video-source';
import {createVideoPlayback} from '../lib/video-playback';
import {useApp} from '../lib/state';
import {Icon} from './ui';

const playback=createVideoPlayback();
export function InlineVideo({url,contentType,poster,autoPlay=false}:{url:string;contentType?:string;poster?:string;autoPlay?:boolean}){
  const {colors}=useApp();
  const [started,setStarted]=useState(autoPlay),[revision,setRevision]=useState(0),[posterFailed,setPosterFailed]=useState(false);
  const source=videoSource(url,contentType);if(!source)return null;
  return <Pressable accessible={false} focusable={false} onPress={event=>event.stopPropagation()} style={{height:224,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:'#000'}}>
    {started?<Playback key={revision} source={source} retry={()=>setRevision(value=>value+1)}/>:<Pressable accessibilityRole="button" accessibilityLabel="Play video" onPress={event=>{event.stopPropagation();setStarted(true);}} style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      {poster&&!posterFailed&&<Image source={{uri:poster}} onError={()=>setPosterFailed(true)} style={{position:'absolute',width:'100%',height:'100%'}} contentFit="cover"/>}
      <View pointerEvents="none" style={{width:54,height:54,borderRadius:27,backgroundColor:'#00000099',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={25} color="#fff"/></View>
    </Pressable>}
  </Pressable>;
}
function Playback({source,retry}:{source:NonNullable<ReturnType<typeof videoSource>>;retry:()=>void}){
  const player=useVideoPlayer(source,value=>{value.loop=true;value.muted=true;value.staysActiveInBackground=false;value.timeUpdateEventInterval=.25;});
  const insets=useSafeAreaInsets(),[fullScreen,setFullScreen]=useState(false),[playIntent,setPlayIntent]=useState<boolean|null>(null);
  const transition=useRef<{time:number;playing:boolean;full:boolean}|null>(null);
  const {isPlaying}=useEvent(player,'playingChange',{isPlaying:player.playing});
  const playing=playIntent??isPlaying;
  const time=useEvent(player,'timeUpdate'),loaded=useEvent(player,'sourceLoad');
  const currentTime=time?.currentTime??player.currentTime,duration=loaded?.duration||player.duration;
  const progress=Number.isFinite(duration)&&duration>0?Math.max(0,Math.min(1,currentTime/duration)):0;
  const {status}=useEvent(player,'statusChange',{status:player.status}),{muted}=useEvent(player,'mutedChange',{muted:player.muted});
  useEventListener(player,'playingChange',({isPlaying})=>{if(isPlaying)playback.didPlay(player);if(playIntent===isPlaying)setPlayIntent(null);});
  useFocusEffect(useCallback(()=>playback.register(player),[player]));
  // Native expo-video handles backgrounding; the fullscreen overlay shares this player.
  useEffect(()=>{if(Platform.OS!=='web')return;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>subscription.remove();},[player]);
  function toggleMute(){
    // eslint-disable-next-line react-hooks/immutability -- expo-video uses mutable native player properties for playback controls.
    player.muted=!player.muted;
  }
  function togglePlayback(){
    const next=!playing;setPlayIntent(next);
    if(transition.current){transition.current.playing=next;if(!next)player.pause();return;}
    if(next)playback.play(player);else player.pause();
  }
  function changeFullscreen(full:boolean){
    const resume=playIntent??player.playing;
    transition.current={time:player.currentTime,playing:resume,full};
    setPlayIntent(resume);player.pause();setFullScreen(full);
  }
  // eslint-disable-next-line react-hooks/immutability -- expo-video requires mutable native position updates when moving the shared player view.
  const restoreTransition=useCallback(()=>{
    const saved=transition.current;if(!saved||saved.full!==fullScreen)return;
    transition.current=null;
    // eslint-disable-next-line react-hooks/immutability -- this is expo-video's documented native seek setter.
    player.currentTime=saved.time;
    if(saved.playing)playback.play(player);else player.pause();
  },[fullScreen,player]);
  useEffect(()=>{if(Platform.OS!=='web'&&!fullScreen&&player.status==='readyToPlay')restoreTransition();},[fullScreen,player,restoreTransition]);
  const video=<VideoView accessibilityLabel={fullScreen?'Fullscreen cast video':'Inline cast video'} player={player} nativeControls={false} fullscreenOptions={{enable:false}} onFirstFrameRender={restoreTransition} contentFit="contain" surfaceType="textureView" style={{width:'100%',height:'100%'}}/>;
  const surface=<View style={{flex:1}}>
    <View style={{flex:1}}>
      {status==='error'?<View style={{flex:1,padding:16,gap:8,alignItems:'center',justifyContent:'center'}}><Text accessibilityRole="alert" style={{color:'#fff',fontSize:14,textAlign:'center'}}>This video couldn’t be played.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={event=>{event.stopPropagation();retry();}} style={{minHeight:44,paddingHorizontal:18,justifyContent:'center',borderRadius:12,backgroundColor:'#262626'}}><Text style={{color:'#fff',fontSize:14,fontWeight:'600'}}>Try again</Text></Pressable></View>:<>
        {fullScreen?video:<Pressable accessibilityRole="button" accessibilityLabel="Open video fullscreen" onPress={event=>{event.stopPropagation();changeFullscreen(true);}} style={{flex:1}}><View pointerEvents="none" style={{flex:1}}>{video}</View></Pressable>}
        <View pointerEvents="box-none" style={{position:'absolute',left:6,right:6,bottom:6,flexDirection:'row',justifyContent:'space-between'}}>
          <Pressable accessibilityRole="button" accessibilityLabel={playing?'Pause video':'Play video'} onPress={event=>{event.stopPropagation();togglePlayback();}} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#00000099'}}><Icon name={playing?'pause':'play'} size={22} color="#fff"/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={muted?'Unmute video':'Mute video'} accessibilityState={{selected:muted}} onPress={event=>{event.stopPropagation();toggleMute();}} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#00000099'}}><Icon name={muted?'volume-x':'volume-2'} size={20} color="#fff"/></Pressable>
        </View>
      </>}
      {(status==='loading'||status==='idle')&&<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'}}><ActivityIndicator accessibilityLabel="Loading video" color="#fff"/></View>}
    </View>
    <View pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel="Video progress" accessibilityValue={{min:0,max:100,now:Math.round(progress*100)}} style={{height:4,backgroundColor:'#4b4b4b'}}><View style={{height:'100%',width:`${progress*100}%`,backgroundColor:'#fff'}}/></View>
  </View>;
  return <View style={{flex:1}}>
    {!fullScreen&&surface}
    {fullScreen&&<Modal visible animationType="none" presentationStyle="fullScreen" hardwareAccelerated statusBarTranslucent navigationBarTranslucent onShow={()=>{if(Platform.OS!=='web'&&player.status==='readyToPlay')restoreTransition();}} onRequestClose={()=>changeFullscreen(false)}>
      <View accessibilityLabel="Fullscreen video" accessibilityViewIsModal style={{flex:1,backgroundColor:'#000',paddingTop:insets.top,paddingBottom:insets.bottom}}>
        <StatusBar style="light"/>
        <View style={{height:52,paddingHorizontal:10,flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel="Close fullscreen video" onPress={event=>{event.stopPropagation();changeFullscreen(false);}} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={24} color="#fff"/></Pressable><Text style={{color:'#fff',fontSize:16,fontWeight:'600',marginLeft:8}}>Video</Text></View>
        {surface}
      </View>
    </Modal>}
  </View>;
}
