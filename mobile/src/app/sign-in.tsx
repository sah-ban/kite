import {Image} from 'expo-image';
import {router} from 'expo-router';
import {useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Linking,ScrollView,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Button,Icon,space} from '../components/ui';

export default function SignIn(){
  const {api,colors,account,accountBusy,accountError,beginSignIn,checkSignIn,signOut}=useApp();
  const [openError,setOpenError]=useState('');
  const appFid=account.pending?.appFid;
  const attribution=useQuery(()=>appFid?api.profile(appFid):Promise.resolve(undefined),[api,appFid]);
  useEffect(()=>{if(account.session){if(router.canGoBack())router.back();else router.replace('/');}},[account.session]);
  useEffect(()=>{
    if(!account.pending||account.session)return;
    let stopped=false,polling=false,expired=false;
    async function check(){
      if(stopped||polling||expired||AppState.currentState!=='active')return;polling=true;
      try{await checkSignIn();}catch(error){if(error instanceof Error&&/expired|cancelled|inactive/.test(error.message))expired=true;}finally{polling=false;}
    }
    const timer=setInterval(()=>void check(),3000);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')void check();});
    return()=>{stopped=true;clearInterval(timer);listener.remove();};
  },[account.pending,account.session,checkSignIn]);
  async function open(){
    setOpenError('');
    try{const value=await beginSignIn();if(value.pending)try{await Linking.openURL(value.pending.deepLinkUrl);}catch{setOpenError('Could not open Farcaster. Install the Farcaster app and try again.');}}
    catch{/* The account error is displayed below. */}
  }
  async function reset(){try{await signOut();setOpenError('');}catch{/* The account error is displayed below. */}}
  return <ScrollView contentContainerStyle={[space.content,{paddingTop:32,gap:22}]}>
    <Image source={require('../../assets/kite-mark.png')} style={{width:64,height:64}} contentFit="contain"/>
    <View style={{gap:10}}><Text style={[space.title,{color:colors.ink}]}>Your people. Your conversations.</Text><Text style={[space.body,{color:colors.muted}]}>Sign in with Farcaster to like and repost casts as yourself.</Text></View>
    <View style={{gap:16,padding:18,borderRadius:18,backgroundColor:colors.soft}}>
      <View style={space.row}><Icon name="external-link" size={18} color={colors.accent}/><Text style={[space.small,{color:colors.ink,flex:1}]}>Approve Kite in the Farcaster app, then return here.</Text></View>
      <View style={space.row}><Icon name="shield" size={18} color={colors.accent}/><Text style={[space.small,{color:colors.ink,flex:1}]}>Your recovery phrase stays private. Kite never asks for it.</Text></View>
    </View>
    <Button label={accountBusy?'Connecting…':account.pending?'Open Farcaster':'Continue with Farcaster'} icon="arrow-up-right" disabled={accountBusy} onPress={()=>void open()}/>
    {account.pending&&<>
      <View style={space.row}><ActivityIndicator color={colors.accent}/><Text style={[space.small,{color:colors.muted,flex:1}]}>Waiting for approval. Return to Kite after confirming.</Text></View>
      {!!attribution.value?.username&&<Text style={[space.small,{color:colors.muted}]}>Your actions will be attributed to @{attribution.value.username}.</Text>}
      <Button label="Check approval" quiet disabled={accountBusy} onPress={()=>void checkSignIn().catch(()=>{})}/>
    </>}
    {!!(openError||accountError)&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:21}}>{openError||accountError}</Text>}
    {account.hasSavedKey&&!account.session&&<Button label={account.pending?'Cancel sign-in':'Reset connection'} quiet disabled={accountBusy} onPress={()=>void reset()}/>}
  </ScrollView>;
}
