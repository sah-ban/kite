import {HapticPressable as Pressable} from './HapticControls';
import {router} from 'expo-router';
import {useEffect,useMemo,useState} from 'react';
import {Animated,PanResponder,Text,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {castRoute,type Cast} from '../lib/model';
import {Icon} from './ui';
export function PublishNotice(){
  const {publishNotice}=useApp();
  if(!publishNotice)return null;
  return <SwipeableNotice key={`${publishNotice.data.fid}:${publishNotice.hash}`} cast={publishNotice}/>;
}
function SwipeableNotice({cast}:{cast:Cast}){
  const {dismissPublishNotice,colors}=useApp(),insets=useSafeAreaInsets(),{width}=useWindowDimensions();
  const [offset]=useState(()=>new Animated.Value(0));
  useEffect(()=>()=>offset.stopAnimation(),[offset]);
  const pan=useMemo(()=>{
    const restore=()=>Animated.spring(offset,{toValue:0,useNativeDriver:true,tension:90,friction:12}).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture:(_,gesture)=>Math.abs(gesture.dx)>12&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.5,
      onPanResponderGrant:()=>offset.stopAnimation(),
      onPanResponderMove:(_,gesture)=>offset.setValue(gesture.dx),
      onPanResponderRelease:(_,gesture)=>{
        if(Math.abs(gesture.dx)>Math.min(100,width*.25)||Math.abs(gesture.dx)>20&&Math.abs(gesture.vx)>.6&&gesture.dx*gesture.vx>0){
          Animated.timing(offset,{toValue:gesture.dx<0?-width:width,duration:180,useNativeDriver:true}).start(({finished})=>{if(finished)dismissPublishNotice();});
        }else restore();
      },
      onPanResponderTerminate:restore,
    });
  },[dismissPublishNotice,offset,width]);
  return <Animated.View {...pan.panHandlers} accessibilityRole="alert" accessibilityHint="Swipe left or right to dismiss" accessibilityActions={[{name:'dismiss',label:'Dismiss publication notice'}]} onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='dismiss')dismissPublishNotice();}} style={{position:'absolute',bottom:Math.max(insets.bottom,12)+64,left:16,right:16,paddingLeft:16,paddingRight:4,minHeight:54,borderRadius:16,backgroundColor:colors.accent,flexDirection:'row',alignItems:'center',gap:10,elevation:5,transform:[{translateX:offset}],opacity:offset.interpolate({inputRange:[-width,0,width],outputRange:[0,1,0],extrapolate:'clamp'})}}><Text style={{flex:1,fontSize:14,fontWeight:'600',color:colors.background}}>Cast published</Text><Pressable accessibilityRole="link" accessibilityLabel="View published cast" onPress={()=>{dismissPublishNotice();router.push(castRoute(cast));}} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'700',color:colors.background}}>View</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Dismiss publication notice" onPress={dismissPublishNotice} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={18} color={colors.background}/></Pressable></Animated.View>;
}
