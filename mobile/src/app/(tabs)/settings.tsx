import {useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {useApp,type ThemeMode} from '../../lib/state';
import {createApi} from '../../lib/api';
import {normalizeServer} from '../../lib/model';
import {useQuery} from '../../lib/hooks';
import {Button,Field,space} from '../../components/ui';
import {openLink} from '../../components/CastCard';

export default function Settings(){
  const {server,setServer,theme,setTheme,colors,api}=useApp();const [address,setAddress]=useState(server),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const status=useQuery(signal=>api.status(signal),[api]);
  async function save(){
    setBusy(true);setMessage('');setError('');
    try{const next=normalizeServer(address);await createApi(next).config();await setServer(next);setAddress(next);setMessage('Server saved. Feeds and profiles now use this server.');}
    catch(error){setError(error instanceof Error?error.message:'Could not save the server.');}finally{setBusy(false);}
  }
  return <ScrollView contentContainerStyle={space.content} keyboardShouldPersistTaps="handled"><Text style={[space.title,{color:colors.ink}]}>Make it yours.</Text><View style={{gap:12}}><Text style={[space.heading,{color:colors.ink}]}>Appearance</Text><View style={[space.row,{flexWrap:'wrap'}]}>{(['system','light','dark'] as ThemeMode[]).map(mode=><Button key={mode} label={mode[0].toUpperCase()+mode.slice(1)} quiet={theme!==mode} onPress={()=>void setTheme(mode).catch(()=>setError('Could not save your theme.'))}/>)}</View></View><View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/><View style={{gap:12}}><Text style={[space.heading,{color:colors.ink}]}>Your Kite server</Text><Text style={[space.small,{color:colors.muted}]}>Use the hosted service or connect to your own HTTPS Kite deployment.</Text><Field value={address} onChangeText={setAddress} accessibilityLabel="Kite server URL" autoCapitalize="none" autoCorrect={false} keyboardType="url"/><Button label={busy?'Checking server…':'Save server'} disabled={busy} onPress={()=>void save()}/>{!!message&&<Text style={{color:colors.accent}}>{message}</Text>}{!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}<View style={[space.row,{justifyContent:'space-between'}]}><Text style={{color:colors.muted,fontSize:13}}>{status.loading?'Checking connection…':status.error?'Node unavailable':status.value?.available?`Connected${status.value.syncDelaySeconds===null?'':` · ${status.value.syncDelaySeconds}s sync delay`}`:'Node unavailable'}</Text><Button label="Refresh" quiet onPress={status.reload}/></View></View><View style={{height:1,backgroundColor:colors.line,marginVertical:4}}/><View style={{gap:12}}><Text style={[space.heading,{color:colors.ink}]}>Android preview</Text><Text style={[space.body,{color:colors.muted}]}>This first build supports browsing. Account approval, posting and notifications will follow. Kite will never ask for your recovery phrase in this app.</Text><Text style={[space.small,{color:colors.muted}]}>Kite 0.1.0 · Open source under the MIT license.</Text><Button label="Read the guide" quiet icon="book-open" onPress={()=>void openLink('https://kite.sahban.dev/guide')}/><Button label="Source on GitHub" quiet icon="github" onPress={()=>void openLink('https://github.com/sah-ban/kite')}/></View></ScrollView>;
}
