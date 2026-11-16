import {router} from 'expo-router';
import {Pressable,Text} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar} from './ui';

export function AccountButton({side='right'}:{side?:'left'|'right'}){
  const {api,account,colors,profileRevision}=useApp(),fid=account.session?.fid;
  const {value}=useQuery(()=>fid?api.profile(fid):Promise.resolve(undefined),[api,fid,profileRevision]);
  return <Pressable accessibilityRole="button" accessibilityLabel={fid?'Open your profile':'Sign in'} onPress={()=>fid?router.push(`/profile/${fid}`):router.push('/sign-in')} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center',marginLeft:side==='left'?12:undefined,marginRight:side==='right'?12:undefined}}>
    {fid?<Avatar url={value?.avatar} size={32}/>:<Text style={{color:colors.accent,fontSize:14,fontWeight:'600'}}>Sign in</Text>}
  </Pressable>;
}
