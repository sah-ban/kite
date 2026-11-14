import {router} from 'expo-router';
import {Pressable,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {castRoute} from '../lib/model';
import {Icon} from './ui';
export function PublishNotice(){
  const {publishNotice,dismissPublishNotice,colors}=useApp(),insets=useSafeAreaInsets();
  if(!publishNotice)return null;
  return <View accessibilityRole="alert" style={{position:'absolute',bottom:Math.max(insets.bottom,12)+64,left:16,right:16,paddingLeft:16,paddingRight:4,minHeight:54,borderRadius:16,backgroundColor:colors.accent,flexDirection:'row',alignItems:'center',gap:10,elevation:5}}><Text style={{flex:1,fontSize:14,fontWeight:'600',color:colors.background}}>Cast published</Text><Pressable accessibilityRole="link" accessibilityLabel="View published cast" onPress={()=>{const route=castRoute(publishNotice);dismissPublishNotice();router.push(route);}} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'700',color:colors.background}}>View</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Dismiss publication notice" onPress={dismissPublishNotice} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={18} color={colors.background}/></Pressable></View>;
}
