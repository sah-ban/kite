import {HapticPressable as Pressable,HapticSwitch as Switch} from '../components/HapticControls';
import {useEffect,useState} from 'react';
import * as Clipboard from 'expo-clipboard';
import {router} from 'expo-router';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useApp} from '../lib/state';
import {PushSettings} from '../components/PushSettings';
import {SettingsRow,SettingsSection} from '../components/SettingsSection';
import {feedback} from '../lib/haptics';
import {Icon} from '../components/ui';

const DEVELOPER_ADDRESS='0x21808EE320eDF64c019A6bb0F7E4bFB3d62F06Ec';

export default function Settings(){
  const {theme,setTheme,colors,dark,hapticsEnabled,setHapticsEnabled}=useApp(),insets=useSafeAreaInsets();
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [hapticError,setHapticError]=useState(''),[savingHaptics,setSavingHaptics]=useState(false);
  const [copyStatus,setCopyStatus]=useState<'idle'|'copied'|'error'>('idle');
  useEffect(()=>{if(copyStatus!=='copied')return;const timer=setTimeout(()=>setCopyStatus('idle'),2000);return()=>clearTimeout(timer);},[copyStatus]);
  async function copyAddress(){
    try{if(!await Clipboard.setStringAsync(DEVELOPER_ADDRESS))throw new Error('Copy failed');setCopyStatus('copied');feedback('success');}
    catch{setCopyStatus('error');feedback('error');}
  }
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
    <SettingsSection title="Support developer">
      <SettingsRow icon="heart" title="Ethereum" description="Support Kite’s development." control={<Pressable accessibilityRole="button" accessibilityLabel="Copy developer Ethereum address" onPress={()=>void copyAddress()} style={({pressed})=>({minHeight:44,minWidth:84,paddingHorizontal:10,borderRadius:12,backgroundColor:pressed?colors.soft:colors.accentSoft,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6})}><Icon name={copyStatus==='copied'?'check':'copy'} size={16} color={colors.accent}/><Text accessibilityLiveRegion="polite" style={{fontSize:13,fontWeight:'600',color:colors.accent}}>{copyStatus==='copied'?'Copied':'Copy'}</Text></Pressable>}/>
      <Text selectable style={{paddingHorizontal:14,paddingBottom:14,fontFamily:'monospace',fontSize:13,lineHeight:20,color:colors.ink}}>{DEVELOPER_ADDRESS}</Text>
      {copyStatus==='error'&&<Text accessibilityRole="alert" style={{paddingHorizontal:14,paddingBottom:14,fontSize:13,lineHeight:19,color:colors.danger}}>Could not copy the address. Please try again.</Text>}
    </SettingsSection>
  </ScrollView>;
}
