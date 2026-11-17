import {useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {Button,space} from '../../components/ui';
import {openLink} from '../../components/CastCard';
import {PushSettings} from '../../components/PushSettings';
import {PendingCastEdits} from '../../components/PendingCastEdits';

export default function Settings(){
  const {theme,setTheme,colors,account}=useApp();
  const [error,setError]=useState('');
  return <ScrollView contentContainerStyle={space.content}>
    <Text style={[space.title,{color:colors.ink}]}>Make it yours.</Text>
    <PendingCastEdits key={account.session?`${account.session.fid}:${account.session.key}`:'signed-out'}/>
    <PushSettings/>
    <View style={{gap:12}}>
      <Text style={[space.heading,{color:colors.ink}]}>Appearance</Text>
      <Button label={theme==='system'?'Following system theme':'Follow system theme'} icon="smartphone" quiet={theme!=='system'} disabled={theme==='system'} onPress={()=>{setError('');void setTheme('system').catch(()=>setError('Could not save your theme. Please try again.'));}}/>
      {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    </View>
    <View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/>
    <View style={{gap:12}}>
      <Text style={[space.heading,{color:colors.ink}]}>About Kite</Text>
      <Button label="Kite on Farcaster" quiet icon="at-sign" onPress={()=>void openLink('https://kite.sahban.dev/profile/925685')}/>
    </View>
  </ScrollView>;
}
