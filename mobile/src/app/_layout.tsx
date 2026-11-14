import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider,useApp} from '../lib/state';
import {Loading} from '../components/ui';

function Navigation(){
  const {colors,dark,ready}=useApp();
  if(!ready)return <Loading/>;
  return <><StatusBar style={dark?'light':'dark'}/><Stack screenOptions={{headerStyle:{backgroundColor:colors.surface},headerTintColor:colors.ink,headerShadowVisible:false,contentStyle:{backgroundColor:colors.background},headerTitleStyle:{fontSize:17,fontWeight:'600'}}}><Stack.Screen name="(tabs)" options={{headerShown:false}}/><Stack.Screen name="cast/[fid]/[hash]" options={{title:'Conversation'}}/><Stack.Screen name="profile/[fid]" options={{title:'Profile'}}/><Stack.Screen name="+not-found" options={{title:'Page not found'}}/></Stack></>;
}
export default function Layout(){return <AppProvider><Navigation/></AppProvider>;}
