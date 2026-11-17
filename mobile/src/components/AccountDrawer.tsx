import {feedback} from '../lib/haptics';
import {HapticPressable as Pressable,HapticSwitch as Switch} from './HapticControls';
import {router,type Href} from 'expo-router';
import Constants from 'expo-constants';
import {Image} from 'expo-image';
import {useCallback,useEffect,useMemo,useRef,useState,type ComponentProps} from 'react';
import {Alert,Animated,Linking,Modal,PanResponder,Platform,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import type {Profile} from '../lib/model';
import {Avatar,Icon} from './ui';

export function AccountDrawer({profile,onClose}:{profile?:Profile;onClose:()=>void}){
  const {colors,account,accountBusy,dark,setTheme,signOut}=useApp(),fid=account.session?.fid;
  const [signingOut,setSigningOut]=useState(false),[changingTheme,setChangingTheme]=useState(false),[error,setError]=useState('');
  const insets=useSafeAreaInsets(),{width}=useWindowDimensions(),drawerWidth=Math.min(320,width*.66);
  const [progress]=useState(()=>new Animated.Value(0));const closing=useRef(false),themeTouch=useRef(false);
  useEffect(()=>()=>progress.stopAnimation(),[progress]);
  const show=useCallback(()=>{if(!closing.current)Animated.timing(progress,{toValue:1,duration:220,useNativeDriver:Platform.OS!=='web'}).start();},[progress]);
  const close=useCallback((after?:()=>void)=>{
    if(closing.current)return;closing.current=true;feedback('light');
    Animated.timing(progress,{toValue:0,duration:180,useNativeDriver:Platform.OS!=='web'}).start(({finished})=>{if(finished){onClose();after?.();}});
  },[onClose,progress]);
  // eslint-disable-next-line react-hooks/refs -- PanResponder stores callbacks; creating it does not invoke gesture handlers.
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponderCapture:(_,gesture)=>!closing.current&&!themeTouch.current&&gesture.dx< -14&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.5,
    onPanResponderGrant:()=>{if(!closing.current)progress.stopAnimation();},
    onPanResponderMove:(_,gesture)=>{if(!closing.current)progress.setValue(Math.max(0,Math.min(1,1+gesture.dx/drawerWidth)));},
    onPanResponderRelease:(_,gesture)=>{if(!closing.current){if(gesture.dx< -drawerWidth*.25||gesture.vx< -.5)close();else show();}},
    onPanResponderTerminate:show,
  }),[drawerWidth,progress,close,show]);
  const go=(path:Href)=>close(()=>router.push(path));
  const external=(url:string)=>close(()=>{void Linking.openURL(url).catch(()=>{});});
  async function changeTheme(value:boolean){
    if(changingTheme)return;setChangingTheme(true);setError('');
    try{await setTheme(value?'dark':'light');}catch{feedback('error');setError('Could not save your theme. Please try again.');}finally{setChangingTheme(false);}
  }
  async function disconnect(){
    if(signingOut||accountBusy)return;setSigningOut(true);setError('');
    try{await signOut();onClose();}catch(error){setError(error instanceof Error?error.message:'Could not sign out. Please try again.');}finally{setSigningOut(false);}
  }
  function confirmSignOut(){
    if(signingOut||accountBusy||changingTheme||closing.current)return;
    Alert.alert('Sign out of Kite?','You’ll need to approve Kite again to sign back in on this device.',[
      {text:'Cancel',style:'cancel'},
      {text:'Sign out',style:'destructive',onPress:()=>{feedback('warning');void disconnect();}},
    ],{cancelable:true});
  }
  return <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onShow={show} onRequestClose={()=>close()}>
    <View style={{flex:1}}>
      <Animated.View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#000',opacity:progress.interpolate({inputRange:[0,1],outputRange:[0,.45]})}}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss account drawer" onPress={()=>close()} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>
      <Animated.View {...pan.panHandlers} accessibilityViewIsModal accessibilityLabel="Account menu" style={{width:drawerWidth,flex:1,backgroundColor:colors.surface,paddingTop:insets.top+8,transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[-drawerWidth,0]})}]}}>
        <View style={{paddingLeft:22,paddingRight:10,height:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image source={require('../../assets/kite-mark.png')} contentFit="contain" accessible={false} style={{width:25,height:25}}/><Text style={{fontSize:23,fontWeight:'700',letterSpacing:-.6,color:colors.ink}}>Kite</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={()=>close()} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={23}/></Pressable></View>
        <ScrollView contentContainerStyle={{flexGrow:1,paddingHorizontal:12,paddingTop:12,paddingBottom:Math.max(insets.bottom,16)}}>
          <Pressable accessibilityRole={fid?'link':undefined} accessibilityLabel={fid?'Open your profile':undefined} disabled={!fid} onPress={()=>{if(fid)go(`/profile/${fid}`);}} style={{paddingHorizontal:10,paddingBottom:20,gap:12}}><Avatar url={profile?.avatar} size={56}/><View style={{gap:4}}><Text numberOfLines={2} style={{fontSize:20,lineHeight:25,fontWeight:'700',color:colors.ink}}>{fid?profile?.name||`FID ${fid}`:'Welcome to Kite'}</Text><Text numberOfLines={1} style={{fontSize:14,color:colors.muted}}>{fid?profile?.username?`@${profile.username}`:`FID ${fid}`:'Connect your Farcaster account'}</Text></View></Pressable>
          <View style={{height:1,backgroundColor:colors.line,marginBottom:8}}/>
          {!fid&&<DrawerItem label="Sign in" icon="log-in" onPress={()=>go('/sign-in')}/>}
          <View style={{marginTop:'auto',paddingTop:20}}>
            {!!error&&<Text accessibilityRole="alert" style={{paddingHorizontal:14,paddingBottom:8,fontSize:13,lineHeight:19,color:colors.danger}}>{error}</Text>}
            <View style={{height:1,backgroundColor:colors.line,marginBottom:8}}/>
            <DrawerItem label="Settings" icon="settings" onPress={()=>go('/settings')}/>
            <View style={{minHeight:50,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:14}}><Icon name={dark?'moon':'sun'} size={21}/><Text style={{flex:1,color:colors.ink,fontSize:16,fontWeight:'500'}}>Dark theme</Text><Switch accessibilityLabel="Dark theme" value={dark} disabled={changingTheme||signingOut} onTouchStart={()=>{themeTouch.current=true;}} onTouchEnd={()=>{themeTouch.current=false;}} onTouchCancel={()=>{themeTouch.current=false;}} onValueChange={value=>void changeTheme(value)} trackColor={{false:colors.line,true:colors.accent}}/></View>
            <DrawerItem label="GitHub" icon="github" external onPress={()=>external('https://github.com/sah-ban/kite')}/>
            {!!fid&&<DrawerItem label={signingOut?'Signing out…':'Sign out'} icon="log-out" danger disabled={signingOut||accountBusy||changingTheme} onPress={confirmSignOut}/>}
            <Text style={{paddingTop:14,textAlign:'center',fontSize:11,color:colors.muted}}>Version {Constants.expoConfig?.version??'—'}</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}

function DrawerItem({label,icon,onPress,external=false,danger=false,disabled=false}:{label:string;icon:ComponentProps<typeof Icon>['name'];onPress:()=>void;external?:boolean;danger?:boolean;disabled?:boolean}){
  const {colors}=useApp();
  return <Pressable haptic={danger?'warning':'selection'} accessibilityRole={external?'link':'button'} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:50,paddingHorizontal:14,borderRadius:12,flexDirection:'row',alignItems:'center',gap:14,backgroundColor:pressed?colors.soft:'transparent',opacity:disabled?.5:1})}><Icon name={icon} size={21} color={danger?colors.danger:colors.ink}/><Text style={{flex:1,color:danger?colors.danger:colors.ink,fontSize:16,fontWeight:'500'}}>{label}</Text>{external&&<Icon name="arrow-up-right" size={16} color={colors.muted}/>}</Pressable>;
}
