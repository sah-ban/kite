import {router,type Href} from 'expo-router';
import {useCallback,useEffect,useMemo,useRef,useState,type ComponentProps} from 'react';
import {Animated,Linking,Modal,PanResponder,Platform,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import type {Profile} from '../lib/model';
import {Avatar,Icon} from './ui';

export function AccountDrawer({profile,onClose}:{profile?:Profile;onClose:()=>void}){
  const {colors,account}=useApp(),fid=account.session?.fid;
  const insets=useSafeAreaInsets(),{width}=useWindowDimensions(),drawerWidth=Math.min(320,width*.86);
  const [progress]=useState(()=>new Animated.Value(0));const closing=useRef(false);
  useEffect(()=>()=>progress.stopAnimation(),[progress]);
  const show=useCallback(()=>{if(!closing.current)Animated.timing(progress,{toValue:1,duration:220,useNativeDriver:Platform.OS!=='web'}).start();},[progress]);
  const close=useCallback((after?:()=>void)=>{
    if(closing.current)return;closing.current=true;
    Animated.timing(progress,{toValue:0,duration:180,useNativeDriver:Platform.OS!=='web'}).start(({finished})=>{if(finished){onClose();after?.();}});
  },[onClose,progress]);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores callbacks; creating it does not invoke gesture handlers.
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponderCapture:(_,gesture)=>!closing.current&&gesture.dx< -14&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.5,
    onPanResponderGrant:()=>{if(!closing.current)progress.stopAnimation();},
    onPanResponderMove:(_,gesture)=>{if(!closing.current)progress.setValue(Math.max(0,Math.min(1,1+gesture.dx/drawerWidth)));},
    onPanResponderRelease:(_,gesture)=>{if(!closing.current){if(gesture.dx< -drawerWidth*.25||gesture.vx< -.5)close();else show();}},
    onPanResponderTerminate:show,
  }),[drawerWidth,progress,close,show]);
  const go=(path:Href)=>close(()=>router.push(path));
  const external=(url:string)=>close(()=>{void Linking.openURL(url).catch(()=>{});});
  return <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onShow={show} onRequestClose={()=>close()}>
    <View style={{flex:1}}>
      <Animated.View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0,.45]})}}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss account drawer" onPress={()=>close()} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>
      <Animated.View {...pan.panHandlers} accessibilityViewIsModal accessibilityLabel="Account menu" style={{width:drawerWidth,flex:1,backgroundColor:colors.surface,paddingTop:insets.top+8,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[-drawerWidth,0]})}]}}>
        <View style={{paddingLeft:22,paddingRight:10,height:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:23,fontWeight:'700',letterSpacing:-.6,color:colors.ink}}>Kite</Text><Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={()=>close()} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={23}/></Pressable></View>
        <ScrollView contentContainerStyle={{paddingHorizontal:12,paddingTop:12,paddingBottom:Math.max(insets.bottom,16)}}>
          <View style={{paddingHorizontal:10,paddingBottom:20,gap:12}}><Avatar url={profile?.avatar} size={56}/><View style={{gap:4}}><Text numberOfLines={2} style={{fontSize:20,lineHeight:25,fontWeight:'700',color:colors.ink}}>{fid?profile?.name||`FID ${fid}`:'Welcome to Kite'}</Text><Text numberOfLines={1} style={{fontSize:14,color:colors.muted}}>{fid?profile?.username?`@${profile.username}`:`FID ${fid}`:'Connect your Farcaster account'}</Text></View></View>
          <View style={{height:1,backgroundColor:colors.line,marginBottom:8}}/>
          {fid?<><DrawerItem label="Profile" icon="user" onPress={()=>go(`/profile/${fid}`)}/><DrawerItem label="Saved drafts" icon="file-text" onPress={()=>go('/drafts')}/></>:<DrawerItem label="Sign in" icon="log-in" onPress={()=>go('/sign-in')}/>}
          <DrawerItem label="Notifications" icon="bell" onPress={()=>go('/(tabs)/notifications')}/>
          <DrawerItem label="Settings" icon="sliders" onPress={()=>go('/(tabs)/settings')}/>
          <View style={{height:1,backgroundColor:colors.line,marginVertical:8}}/>
          <DrawerItem label="Guide" icon="book-open" external onPress={()=>external('https://kite.sahban.dev/guide')}/>
          <DrawerItem label="GitHub" icon="github" external onPress={()=>external('https://github.com/sah-ban/kite')}/>
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

function DrawerItem({label,icon,onPress,external=false}:{label:string;icon:ComponentProps<typeof Icon>['name'];onPress:()=>void;external?:boolean}){
  const {colors}=useApp();
  return <Pressable accessibilityRole={external?'link':'button'} onPress={onPress} style={({pressed})=>({minHeight:50,paddingHorizontal:14,borderRadius:12,flexDirection:'row',alignItems:'center',gap:14,backgroundColor:pressed?colors.soft:'transparent'})}><Icon name={icon} size={21}/><Text style={{flex:1,color:colors.ink,fontSize:16,fontWeight:'500'}}>{label}</Text>{external&&<Icon name="arrow-up-right" size={16} color={colors.muted}/>}</Pressable>;
}
