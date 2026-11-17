import {PushProvider} from '../lib/push-state';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider,useApp} from '../lib/state';
import {Loading} from '../components/ui';
import {View} from 'react-native';
import {PublishNotice} from '../components/PublishNotice';

function Navigation(){
  const {colors,dark,ready}=useApp();
  if(!ready)return <Loading/>;
  return <View style={{flex:1}}><StatusBar style={dark?'light':'dark'}/><Stack screenOptions={{headerStyle:{backgroundColor:colors.surface},headerTintColor:colors.ink,headerShadowVisible:false,contentStyle:{backgroundColor:colors.background},headerTitleStyle:{fontSize:17,fontWeight:'600'}}}><Stack.Screen name="(tabs)" options={{headerShown:false}}/><Stack.Screen name="cast/[fid]/[hash]" options={{title:'Conversation'}}/><Stack.Screen name="profile/[fid]" options={{headerShown:false}}/><Stack.Screen name="sign-in" options={{title:'Sign in',presentation:'modal'}}/><Stack.Screen name="settings" options={{title:'Settings'}}/><Stack.Screen name="drafts" options={{title:'Saved drafts'}}/><Stack.Screen name="compose" options={{title:'New cast',presentation:'modal'}}/><Stack.Screen name="edit/[fid]/[hash]" options={{title:'Edit cast',presentation:'modal'}}/><Stack.Screen name="+not-found" options={{title:'Page not found'}}/></Stack><PublishNotice/></View>;
}
export default function Layout(){return <AppProvider><PushProvider><Navigation/></PushProvider></AppProvider>;}
