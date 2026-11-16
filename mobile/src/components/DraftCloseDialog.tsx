import {Modal,Pressable,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {Button,Icon} from './ui';

export function DraftCloseDialog({busy,error,onSave,onDiscard,onCancel}:{busy:boolean;error:string;onSave:()=>void;onDiscard:()=>void;onCancel:()=>void}){
  const {colors}=useApp();
  return <Modal transparent visible animationType="fade" onRequestClose={()=>{if(!busy)onCancel();}}>
    <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:'#00000066'}}>
      <View accessibilityViewIsModal style={{width:'100%',maxWidth:380,alignSelf:'center',backgroundColor:colors.surface,borderRadius:24,padding:24,gap:16}}>
        <View style={{alignSelf:'flex-start',padding:12,borderRadius:16,backgroundColor:colors.accentSoft}}><Icon name="file-text" color={colors.accent} size={24}/></View>
        <Text accessibilityRole="header" style={{fontSize:22,fontWeight:'700',color:colors.ink}}>Save this draft?</Text>
        <Text style={{fontSize:15,lineHeight:22,color:colors.muted}}>Keep it in Saved Drafts to finish later, or discard it.</Text>
        {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,fontSize:14,lineHeight:20}}>{error}</Text>}
        <Button label={busy?'Working…':'Save draft'} icon="file-text" disabled={busy} onPress={onSave}/>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onDiscard} style={{minHeight:44,alignItems:'center',justifyContent:'center',opacity:busy?.45:1}}><Text style={{fontSize:15,fontWeight:'600',color:colors.danger}}>Discard draft</Text></Pressable>
        <Button label="Keep editing" quiet disabled={busy} onPress={onCancel}/>
      </View>
    </View>
  </Modal>;
}
