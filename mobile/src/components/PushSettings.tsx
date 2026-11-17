import {HapticPressable as Pressable,HapticSwitch as Switch} from './HapticControls';
import {router} from 'expo-router';
import {ActivityIndicator,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {usePush} from '../lib/push-state';
import {Icon} from './ui';
import {SettingsRow,SettingsSection} from './SettingsSection';
export function PushSettings(){
  const {colors,account,accountBusy}=useApp(),push=usePush();
  const signedIn=!!account.session,available=signedIn&&push.supported;
  const permissionError=/permission|allow notifications|phone settings/i.test(push.error);
  const description=!signedIn?'Sign in to receive activity alerts.':!push.supported?'Available in the installed Android app.':push.busy?'Updating your notification preferences…':push.enabled?'Activity alerts are on for this phone.':'Get activity alerts when Kite is closed.';
  return <SettingsSection title="Notifications">
    <SettingsRow icon="bell" title="Push notifications" description={description} onPress={!signedIn?()=>router.push('/sign-in'):undefined} control={signedIn?<View style={{flexDirection:'row',alignItems:'center',gap:6}}>{push.busy&&<ActivityIndicator size="small" color={colors.accent}/>}<Switch accessibilityLabel="Push notifications" accessibilityState={{busy:push.busy}} value={available&&push.enabled} disabled={!available||push.busy||accountBusy} onValueChange={value=>value?push.enable():push.disable()} trackColor={{false:colors.line,true:colors.accent}}/></View>:undefined}/>
    {available&&<Text style={{paddingHorizontal:14,paddingBottom:14,fontSize:12,lineHeight:18,color:colors.muted}}>Mentions, replies, likes, recasts and follows.</Text>}
    {!!push.error&&signedIn&&<View style={{borderTopWidth:1,borderColor:colors.line,padding:14,gap:8}}><View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><Icon name="alert-circle" size={16} color={colors.danger}/><Text accessibilityRole="alert" style={{flex:1,color:colors.danger,fontSize:13,lineHeight:19}}>{push.error}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={permissionError?'Open phone settings':'Retry push notifications'} disabled={push.busy||accountBusy} onPress={permissionError?push.openSettings:push.enabled?push.disable:push.enable} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:6}}><Text style={{color:colors.accent,fontSize:13,fontWeight:'600'}}>{permissionError?'Open phone settings':'Try again'}</Text><Icon name={permissionError?'arrow-up-right':'refresh-cw'} size={14} color={colors.accent}/></Pressable></View>}
  </SettingsSection>;
}
