import {HapticSwitch as Switch} from '../components/HapticControls';
import {useState} from 'react';
import {router} from 'expo-router';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {PushSettings} from '../components/PushSettings';
import {SettingsRow,SettingsSection} from '../components/SettingsSection';
import {feedback} from '../lib/haptics';

export default function Settings(){
  const {theme,setTheme,colors,dark,hapticsEnabled,setHapticsEnabled}=useApp(),insets=useSafeAreaInsets();
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [hapticError,setHapticError]=useState(''),[savingHaptics,setSavingHaptics]=useState(false);
  async function changeHaptics(value:boolean){
    if(savingHaptics)return;setSavingHaptics(true);setHapticError('');
    try{await setHapticsEnabled(value);}catch{feedback('error');setHapticError('Could not save your haptics preference. Please try again.');}finally{setSavingHaptics(false);}
  }
  async function changeSystem(value:boolean){
    if(saving)return;setSaving(true);setError('');
    try{await setTheme(value?'system':dark?'dark':'light');}catch{feedback('error');setError('Could not save your theme. Please try again.');}finally{setSaving(false);}
  }
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={{paddingHorizontal:16,paddingTop:20,paddingBottom:Math.max(insets.bottom,20),gap:22}}>
    <PushSettings/>
    <SettingsSection title="Feedback"><SettingsRow icon="zap" title="Haptic feedback" description="Subtle feedback for taps, selections, and completed actions." control={<Switch accessibilityLabel="Haptic feedback" value={hapticsEnabled} disabled={savingHaptics} haptic={false} onValueChange={value=>void changeHaptics(value)} trackColor={{false:colors.line,true:colors.accent}}/>}/>{!!hapticError&&<Text accessibilityRole="alert" style={{padding:14,color:colors.danger,fontSize:13,lineHeight:19}}>{hapticError}</Text>}</SettingsSection>
    <SettingsSection title="Appearance"><SettingsRow icon="smartphone" title="Follow system theme" description={theme==='system'?'Match your phone’s light or dark mode.':`Using ${dark?'dark':'light'} theme. Change it in the account drawer.`} control={<View style={{flexDirection:'row',alignItems:'center',gap:6}}>{saving&&<ActivityIndicator size="small" color={colors.accent}/>}<Switch accessibilityLabel="Follow system theme" value={theme==='system'} disabled={saving} onValueChange={value=>void changeSystem(value)} trackColor={{false:colors.line,true:colors.accent}}/></View>}/>{!!error&&<Text accessibilityRole="alert" style={{paddingHorizontal:14,paddingBottom:14,color:colors.danger,fontSize:13,lineHeight:19}}>{error}</Text>}</SettingsSection>
    <SettingsSection title="About"><SettingsRow icon="at-sign" title="Kite on Farcaster" description="@kiteapp" onPress={()=>router.push('/profile/925685')}/></SettingsSection>
  </ScrollView>;
}
