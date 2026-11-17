import {useState} from 'react';
import {router} from 'expo-router';
import {ActivityIndicator,ScrollView,Switch,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {PushSettings} from '../components/PushSettings';
import {SettingsRow,SettingsSection} from '../components/SettingsSection';

export default function Settings(){
  const {theme,setTheme,colors,dark}=useApp(),insets=useSafeAreaInsets();
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  async function changeSystem(value:boolean){
    if(saving)return;setSaving(true);setError('');
    try{await setTheme(value?'system':dark?'dark':'light');}catch{setError('Could not save your theme. Please try again.');}finally{setSaving(false);}
  }
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={{paddingHorizontal:16,paddingTop:20,paddingBottom:Math.max(insets.bottom,20),gap:22}}>
    <PushSettings/>
    <SettingsSection title="Appearance"><SettingsRow icon="smartphone" title="Follow system theme" description={theme==='system'?'Match your phone’s light or dark mode.':`Using ${dark?'dark':'light'} theme. Change it in the account drawer.`} control={<View style={{flexDirection:'row',alignItems:'center',gap:6}}>{saving&&<ActivityIndicator size="small" color={colors.accent}/>}<Switch accessibilityLabel="Follow system theme" value={theme==='system'} disabled={saving} onValueChange={value=>void changeSystem(value)} trackColor={{false:colors.line,true:colors.accent}}/></View>}/>{!!error&&<Text accessibilityRole="alert" style={{paddingHorizontal:14,paddingBottom:14,color:colors.danger,fontSize:13,lineHeight:19}}>{error}</Text>}</SettingsSection>
    <SettingsSection title="About"><SettingsRow icon="at-sign" title="Kite on Farcaster" description="@kiteapp" onPress={()=>router.push('/profile/925685')}/></SettingsSection>
  </ScrollView>;
}
