import {useState} from 'react';
import {router} from 'expo-router';
import {ScrollView,Text,View} from 'react-native';
import {useApp,type ThemeMode} from '../../lib/state';
import {Button,space} from '../../components/ui';
import {openLink,Person} from '../../components/CastCard';
import {PendingCastEdits} from '../../components/PendingCastEdits';

export default function Settings(){
  const {theme,setTheme,colors,account,accountBusy,accountError,signOut}=useApp();
  const [error,setError]=useState('');
  return <ScrollView contentContainerStyle={space.content}>
    <Text style={[space.title,{color:colors.ink}]}>Make it yours.</Text>
    <View style={{gap:12}}>
      <Text style={[space.heading,{color:colors.ink}]}>Account</Text>
      {account.session?<><Person fid={account.session.fid}/><Button label="Sign out" quiet disabled={accountBusy} onPress={()=>void signOut().catch(()=>{})}/></>:<><Button label="Sign in with Farcaster" onPress={()=>router.push('/sign-in')}/>{account.hasSavedKey&&<Button label="Reset saved connection" quiet disabled={accountBusy} onPress={()=>void signOut().catch(()=>{})}/>}</>}
      {!!accountError&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:21}}>{accountError}</Text>}
      <PendingCastEdits key={account.session?`${account.session.fid}:${account.session.key}`:'signed-out'}/>
    </View>
    <View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/>
    <View style={{gap:12}}>
      <Text style={[space.heading,{color:colors.ink}]}>Appearance</Text>
      <View style={[space.row,{flexWrap:'wrap'}]}>
        {(['system','light','dark'] as ThemeMode[]).map(mode=><Button key={mode} label={mode[0].toUpperCase()+mode.slice(1)} quiet={theme!==mode} onPress={()=>{setError('');void setTheme(mode).catch(()=>setError('Could not save your theme. Please try again.'));}}/>)}
      </View>
      {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    </View>
    <View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/>
    <View style={{gap:12}}>
      <Text style={[space.heading,{color:colors.ink}]}>About Kite</Text>
      <Text style={[space.small,{color:colors.muted}]}>Version 0.1.0</Text>
      <Button label="Kite on Farcaster" quiet icon="at-sign" onPress={()=>void openLink('https://kite.sahban.dev/profile/925685')}/>
      <Button label="Source on GitHub" quiet icon="github" onPress={()=>void openLink('https://github.com/sah-ban/kite')}/>
    </View>
  </ScrollView>;
}
