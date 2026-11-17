import {NotificationProvider,useNotifications} from '../../lib/notification-state';
import {router,Tabs} from 'expo-router';
import {Image} from 'expo-image';
import {Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {Icon} from '../../components/ui';
import {AccountButton} from '../../components/AccountButton';
import {feedback} from '../../lib/haptics';

export default function TabLayout(){
  const {account,api}=useApp();
  return <NotificationProvider key={`${api.origin}:${account.session?.fid||0}`}><TabNavigator/></NotificationProvider>;
}
function TabNavigator(){
  const {colors,account}=useApp(),{unread}=useNotifications();
  return <Tabs screenListeners={{tabPress:()=>feedback('selection')}} screenOptions={{headerStyle:{backgroundColor:colors.surface},headerShadowVisible:false,headerTintColor:colors.ink,headerRight:()=> <AccountButton/>,tabBarShowLabel:false,tabBarIconStyle:{width:30,height:30,marginVertical:'auto'},tabBarActiveTintColor:colors.accent,tabBarInactiveTintColor:colors.muted,tabBarStyle:{backgroundColor:colors.surface,borderTopColor:colors.line},sceneStyle:{backgroundColor:colors.background},headerTitle:()=> <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Image source={require('../../../assets/kite-mark.png')} style={{width:25,height:25}} contentFit="contain"/><Text style={{color:colors.ink,fontSize:22,fontWeight:'700',letterSpacing:-.6}}>Kite</Text></View>}}>
    <Tabs.Screen name="index" options={{title:'Home',tabBarAccessibilityLabel:'Home',tabBarIcon:({focused})=><Icon name="home" color={focused?colors.accent:colors.muted}/>}}/>
    <Tabs.Screen name="post" listeners={{tabPress:event=>{event.preventDefault();router.push(account.session?'/compose':'/sign-in');}}} options={{title:'Post',tabBarAccessibilityLabel:'New cast',tabBarIcon:()=> <View style={{width:30,height:30,borderRadius:9,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'}}><Icon name="plus" size={22} color={colors.background}/></View>}}/>
    <Tabs.Screen name="notifications" options={{title:'Notifications',tabBarAccessibilityLabel:'Notifications',tabBarBadge:unread?unread>99?'99+':unread:undefined,tabBarBadgeStyle:{backgroundColor:colors.accent,color:colors.background},tabBarIcon:({focused})=><Icon name="bell" color={focused?colors.accent:colors.muted}/>}}/>
  </Tabs>;
}
