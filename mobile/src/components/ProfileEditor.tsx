import * as ImagePicker from 'expo-image-picker';
import {Image} from 'expo-image';
import {router,Stack} from 'expo-router';
import {useState} from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {type Profile,safeLink} from '../lib/model';
import {profileChanges,profileFields,type ProfileChanges,type ProfileField} from '../lib/profile-edit';
import {MAX_IMAGE_BYTES} from '../lib/composer';
import {Avatar,Button,Field,space} from './ui';

export function ProfileEditor({profile}:{profile:Profile}){
  const {api,colors,saveProfile,accountBusy}=useApp();
  const [baseline,setBaseline]=useState(profile),[draft,setDraft]=useState(profile),[busy,setBusy]=useState(false),[uploading,setUploading]=useState<ProfileField|null>(null),[error,setError]=useState('');
  const pro=useQuery(async signal=>(await api.proExpiry(profile.fid,signal))>Date.now()/1000,[api,profile.fid]);
  const isPro=pro.value===true,locked=busy||!!uploading||accountBusy;
  const changes:ProfileChanges={};for(const field of Object.keys(profileFields) as ProfileField[])if(draft[field]!==baseline[field])changes[field]=draft[field];
  const changed=Object.keys(changes).length>0;
  function update(field:ProfileField,value:string){setDraft(previous=>({...previous,[field]:value}));}
  async function upload(field:'avatar'|'banner'){
    setUploading(field);setError('');
    try{
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1});
      if(result.canceled)return;const asset=result.assets[0];
      if(asset.fileSize&&asset.fileSize>MAX_IMAGE_BYTES)throw new Error('Images must be 10 MB or smaller.');
      const response=await fetch(asset.uri);const bytes=new Uint8Array(await response.arrayBuffer());
      update(field,await api.uploadImage(bytes));
    }catch(error){setError(error instanceof Error?error.message:'Could not upload image.');}finally{setUploading(null);}
  }
  async function save(){
    setError('');setBusy(true);let acceptedCount=0;
    try{
      profileChanges(changes);
      if(changes.banner&&!isPro)throw new Error('Adding or changing a banner requires Farcaster Pro.');
      await saveProfile(changes,accepted=>{acceptedCount++;setBaseline(previous=>({...previous,...accepted}));});
      router.back();
    }catch(error){setError(`${acceptedCount?`${acceptedCount} change(s) saved. Your remaining edits are kept here. `:''}${error instanceof Error?error.message:'Could not save profile.'}`);}finally{setBusy(false);}
  }
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:colors.background}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <Stack.Screen options={{title:'Edit profile',headerBackVisible:!locked}}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:20,paddingBottom:48}}>
      <View style={{gap:12,alignItems:'center'}}><Avatar key={draft.avatar} url={draft.avatar} size={88}/><Button label={uploading==='avatar'?'Uploading…':'Change profile image'} quiet icon="image" disabled={locked} onPress={()=>void upload('avatar')}/></View>
      {(['name','bio','website'] as const).map(field=><View key={field} style={{gap:7}}><Text style={{color:colors.ink,fontSize:14,fontWeight:'600'}}>{profileFields[field].label}</Text><Field value={draft[field]} onChangeText={value=>update(field,value)} accessibilityLabel={profileFields[field].label} editable={!locked} multiline={field==='bio'} autoCapitalize={field==='website'?'none':'sentences'} autoCorrect={field!=='website'} keyboardType={field==='website'?'url':'default'} style={field==='bio'?{minHeight:110,textAlignVertical:'top',paddingVertical:12}:undefined}/><Text style={{fontSize:12,color:new TextEncoder().encode(draft[field]).length>profileFields[field].max?colors.danger:colors.muted}}>{new TextEncoder().encode(draft[field]).length}/{profileFields[field].max} bytes</Text></View>)}
      <View style={{gap:10}}><Text style={[space.heading,{color:colors.ink}]}>Banner</Text>{!!draft.banner&&safeLink(draft.banner)&&<Image source={{uri:draft.banner}} contentFit="cover" style={{width:'100%',height:120,borderRadius:12}}/>}<Button label={uploading==='banner'?'Uploading…':'Change banner'} quiet icon="image" disabled={locked||!isPro} onPress={()=>void upload('banner')}/>{!!draft.banner&&<Button label="Remove banner" quiet disabled={locked} onPress={()=>update('banner','')}/>}{!isPro&&<Text style={{color:colors.muted,fontSize:13}}>{pro.loading?'Checking Pro status…':pro.error?'Could not check Pro status.':'Adding or changing a banner requires Farcaster Pro.'}</Text>}{!!pro.error&&<Button label="Retry Pro status" quiet onPress={pro.reload}/>}</View>
      {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:21}}>{error}</Text>}
      <Button label={busy?'Saving…':'Save profile'} disabled={locked||!changed} onPress={()=>void save()}/>
    </ScrollView>
  </KeyboardAvoidingView>;
}
