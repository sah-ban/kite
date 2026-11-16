import {Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {usePush} from '../lib/push-state';
import {Button,space} from './ui';
export function PushSettings(){
  const {colors,account,accountBusy}=useApp(),push=usePush();
  if(!account.session||!push.supported)return null;
  return <View style={{gap:12}}>
    <Text style={[space.heading,{color:colors.ink}]}>Push notifications</Text>
    <Text style={[space.small,{color:colors.muted}]}>{push.enabled?'Activity alerts are on for this phone.':'Get mentions, replies, likes, recasts and follows when Kite is closed.'}</Text>
    <Button label={push.busy?'Updating…':push.enabled?'Turn off notifications':'Enable notifications'} icon="bell" quiet={push.enabled} disabled={push.busy||accountBusy} onPress={push.enabled?push.disable:push.enable}/>
    {!!push.error&&<><Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:21}}>{push.error}</Text><Button label="Open phone settings" quiet onPress={push.openSettings}/></>}
    <View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/>
  </View>;
}
