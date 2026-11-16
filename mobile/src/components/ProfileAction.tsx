import {router} from 'expo-router';
import {useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Button} from './ui';

export function ProfileAction({fid}:{fid:number}){
  const {api,account,accountBusy,followOverrides,follow,colors}=useApp(),viewer=account.session?.fid;
  const status=useQuery(signal=>viewer&&viewer!==fid?api.isFollowing(viewer,fid,signal):Promise.resolve(false),[api,viewer,fid]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
  if(viewer===fid)return <Button label="Edit profile" quiet icon="edit-2" onPress={()=>router.push('/profile/edit')}/>;
  const active=viewer?followOverrides.get(`${viewer}:${fid}`)??status.value:false;
  async function toggle(){
    if(!viewer){router.push('/sign-in');return;}
    if(lock.current||active===undefined)return;lock.current=true;setBusy(true);setError('');
    try{await follow(fid,!!active);}catch(error){setError(error instanceof Error?error.message:'Could not update follow status.');}finally{lock.current=false;setBusy(false);}
  }
  return <View style={{gap:6,alignItems:'flex-end',maxWidth:220}}>
    {viewer&&status.error&&active===undefined?<Button label="Retry follow status" quiet onPress={status.reload}/>:<Button label={busy?'Updating…':viewer&&active===undefined?'Loading…':active?'Unfollow':'Follow'} quiet={!!active} icon={active?'user-check':'user-plus'} disabled={busy||accountBusy||!!viewer&&active===undefined} onPress={()=>void toggle()}/>}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:12}}>{error}</Text>}
  </View>;
}
