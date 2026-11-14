import * as Clipboard from 'expo-clipboard';
import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {ActivityIndicator,Linking,Modal,Pressable,ScrollView,Share,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg,{Path} from 'react-native-svg';
import {type Cast,castRoute} from '../lib/model';
import {useApp} from '../lib/state';
import {Icon} from './ui';

function FarcasterIcon(){const {colors}=useApp();return <Svg width={20} height={20} viewBox="0 0 675 592"><Path fill={colors.ink} d="M675 0V79.9376H594.971V159.807H619.49V159.834H675V592H540.947L540.865 591.605L472.463 268.309C465.941 237.491 448.874 209.607 424.41 189.777C399.944 169.947 369.127 159.031 337.637 159.031H337.369C305.88 159.031 275.062 169.947 250.597 189.777C226.133 209.607 209.065 237.501 202.544 268.309L134.063 592H0V159.824H55.5103V159.807H80.026V79.9376H0V0H675Z"/></Svg>;}

export function CastMenu({cast}:{cast:Cast}){
  const {colors,account,accountBusy,deleteCast}=useApp();
  const [open,setOpen]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2500);return()=>clearTimeout(timer);},[notice]);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Cast options" accessibilityState={{expanded:open}} onPress={event=>{event.stopPropagation();setNotice('');setOpen(true);}} hitSlop={4} style={({pressed})=>({width:36,height:40,alignItems:'center',justifyContent:'center',borderRadius:18,backgroundColor:pressed?colors.soft:'transparent'})}><Icon name="more-horizontal" size={20} color={colors.muted}/></Pressable>
    {!!notice&&<Text accessibilityRole="alert" style={{position:'absolute',right:0,top:38,minWidth:92,padding:8,borderRadius:10,backgroundColor:colors.soft,color:colors.ink,fontSize:12,zIndex:1}}>{notice}</Text>}
    {open&&<CastOptionsSheet cast={cast} own={account.session?.fid===cast.data.fid} accountBusy={accountBusy} onClose={()=>setOpen(false)} onCopied={()=>{setNotice('Link copied');setOpen(false);}} onDelete={()=>deleteCast(cast)}/>}
  </View>;
}

export function CastOptionsSheet({cast,own,accountBusy=false,onClose,onCopied,onDelete}:{cast:Cast;own:boolean;accountBusy?:boolean;onClose:()=>void;onCopied:()=>void;onDelete:()=>Promise<void>}){
  const {colors}=useApp(),insets=useSafeAreaInsets();
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  const link=`https://kite.sahban.dev${castRoute(cast)}`;
  const close=()=>{if(!busy)onClose();};
  async function run(action:'copy'|'share'|'farcaster'|'delete'){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(action==='copy'){const copied=await Clipboard.setStringAsync(link);if(!copied)throw new Error('Couldn’t copy the link. Please try again.');onCopied();}
      if(action==='share'){await Share.share({message:link});onClose();}
      if(action==='farcaster'){await Linking.openURL(`https://farcaster.xyz/~/conversations/${cast.hash}`);onClose();}
      if(action==='delete'){if(!own||!confirm)throw new Error('You can only delete your own casts.');await onDelete();onClose();}
    }catch(error){setError(error instanceof Error?error.message:'Could not complete this action. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  }

  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={close}>
    <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#00000066'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close cast options" disabled={busy} onPress={close} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>
      <View accessibilityViewIsModal style={{maxHeight:'85%',backgroundColor:colors.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:10,paddingBottom:Math.max(insets.bottom,12),paddingHorizontal:8}}>
        <View style={{width:36,height:4,borderRadius:2,backgroundColor:colors.line,alignSelf:'center',marginBottom:12}}/>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700',color:colors.ink,paddingHorizontal:18,paddingBottom:12}}>{confirm?'Delete this cast?':'Cast options'}</Text>
          {confirm?<><Text style={{fontSize:15,lineHeight:22,color:colors.muted,paddingHorizontal:18,paddingBottom:12}}>This permanently deletes your cast. It can’t be undone.</Text><MenuItem label={busy?'Deleting…':'Delete cast'} icon="trash-2" disabled={busy||accountBusy} danger onPress={()=>void run('delete')}/><MenuItem label="Cancel" icon="x" disabled={busy} onPress={()=>{setConfirm(false);setError('');}}/></>:<>
            <MenuItem label="Copy link" icon="link" disabled={busy} onPress={()=>void run('copy')}/>
            <MenuItem label="Share cast" icon="share" disabled={busy} onPress={()=>void run('share')}/>
            <Pressable accessibilityRole="button" accessibilityLabel="Open in Farcaster" disabled={busy} onPress={()=>void run('farcaster')} style={({pressed})=>({minHeight:54,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:14,borderRadius:12,backgroundColor:pressed?colors.soft:'transparent',opacity:busy?.45:1})}><FarcasterIcon/><Text style={{fontSize:16,fontWeight:'500',color:colors.ink}}>Open in Farcaster</Text></Pressable>
            {own&&<MenuItem label="Delete cast" icon="trash-2" disabled={busy||accountBusy} danger onPress={()=>{setConfirm(true);setError('');}}/>}
            <MenuItem label="Cancel" icon="x" disabled={busy} onPress={close}/>
          </>}
          {busy&&<ActivityIndicator accessibilityLabel={confirm?'Deleting cast':'Working'} color={colors.accent} style={{padding:12}}/>}
          {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:14,lineHeight:20,padding:18}}>{error}</Text>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function MenuItem({label,icon,onPress,disabled,danger=false}:{label:string;icon:ComponentProps<typeof Icon>['name'];onPress:()=>void;disabled:boolean;danger?:boolean}){
  const {colors}=useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={({pressed})=>({minHeight:54,paddingHorizontal:18,flexDirection:'row',gap:14,alignItems:'center',borderRadius:12,opacity:disabled?.45:1,backgroundColor:pressed?colors.soft:'transparent'})}><Icon name={icon} size={20} color={danger?colors.danger:colors.ink}/><Text style={{color:danger?colors.danger:colors.ink,fontSize:16,fontWeight:danger?'600':'500'}}>{label}</Text></Pressable>;
}
