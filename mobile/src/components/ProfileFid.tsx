import * as Clipboard from 'expo-clipboard';
import {useEffect,useState} from 'react';
import {Pressable,Text} from 'react-native';
import {useApp} from '../lib/state';
import {Icon} from './ui';

export function ProfileFid({fid}:{fid:number}){
  const {colors}=useApp();const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle');
  useEffect(()=>{if(status==='idle')return;const timer=setTimeout(()=>setStatus('idle'),2000);return()=>clearTimeout(timer);},[status]);
  async function copy(){
    try{if(!await Clipboard.setStringAsync(String(fid)))throw new Error('Copy failed');setStatus('copied');}catch{setStatus('error');}
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={`Copy FID ${fid}`} onPress={()=>void copy()} style={({pressed})=>({marginLeft:'auto',minHeight:44,paddingLeft:6,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5,opacity:pressed?.65:1})}>
    <Text accessibilityLiveRegion="polite" style={{color:status==='error'?colors.danger:status==='copied'?colors.accent:colors.muted,fontSize:12}}>{status==='copied'?'Copied':status==='error'?'Copy failed':`FID ${fid}`}</Text><Icon name={status==='copied'?'check':'copy'} size={12} color={status==='error'?colors.danger:colors.muted}/>
  </Pressable>;
}
