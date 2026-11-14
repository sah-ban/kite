import {Tabs} from 'expo-router';
import {Image} from 'expo-image';
import {Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {Icon} from '../../components/ui';

export default function TabLayout(){
  const {colors}=useApp();
  return <Tabs screenOptions={{headerStyle:{backgroundColor:colors.surface},headerShadowVisible:false,headerTintColor:colors.ink,tabBarActiveTintColor:colors.accent,tabBarInactiveTintColor:colors.muted,tabBarStyle:{backgroundColor:colors.surface,borderTopColor:colors.line},tabBarLabelStyle:{fontSize:11,fontWeight:'500'},sceneStyle:{backgroundColor:colors.background},headerTitle:()=> <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image source={require('../../../assets/kite-mark.png')} style={{width:25,height:25}} contentFit="contain"/><Text style={{color:colors.ink,fontSize:22,fontWeight:'700',letterSpacing:-.6}}>Kite</Text></View>}}>
    <Tabs.Screen name="index" options={{title:'Home',tabBarIcon:({focused})=><Icon name="home" color={focused?colors.accent:colors.muted}/>}}/>
    <Tabs.Screen name="search" options={{title:'Search',tabBarIcon:({focused})=><Icon name="search" color={focused?colors.accent:colors.muted}/>}}/>
    <Tabs.Screen name="settings" options={{title:'Settings',tabBarIcon:({focused})=><Icon name="sliders" color={focused?colors.accent:colors.muted}/>}}/>
  </Tabs>;
}
