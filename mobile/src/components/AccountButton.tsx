import {useState} from 'react';
import {Pressable} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar} from './ui';
import {AccountDrawer} from './AccountDrawer';

export function AccountButton({side='right'}:{side?:'left'|'right'}){
  const {api,account,profileRevision}=useApp(),fid=account.session?.fid;
  const [open,setOpen]=useState(false);
  const {value}=useQuery(()=>fid?api.profile(fid):Promise.resolve(undefined),[api,fid,profileRevision]);
  return <><Pressable accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityState={{expanded:open}} onPress={()=>setOpen(true)} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center',marginLeft:side==='left'?12:undefined,marginRight:side==='right'?12:undefined}}>
    <Avatar url={value?.avatar} size={32}/>
  </Pressable>{open&&<AccountDrawer profile={value} onClose={()=>setOpen(false)}/>}</>;
}
