import {Image} from 'expo-image';
import {useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import {type MiniAppEmbed as MiniApp,miniAppLaunchURL} from '../lib/miniapp';
import {safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {FarcasterIcon} from './FarcasterIcon';
import {Icon} from './ui';

export function MiniAppEmbed({app,height}:{app:MiniApp;height?:number}){
  const {colors}=useApp(),[failed,setFailed]=useState(false),[error,setError]=useState('');
  const launch=miniAppLaunchURL(app.url),image=safeLink(app.imageUrl);
  if(!launch||!image)return null;
  return <View style={{gap:4,height}}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${app.buttonTitle} — open ${app.name||'miniapp'} in Farcaster`} onPress={event=>{event.stopPropagation();setError('');void Linking.openURL(launch).catch(()=>setError('Could not open Farcaster. Please try again.'));}} style={({pressed})=>({flex:height?1:undefined,minHeight:0,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft,opacity:pressed?.8:1})}>
      <View style={{width:'100%',aspectRatio:height?undefined:3/2,flex:height?1:undefined,minHeight:0,alignItems:'center',justifyContent:'center'}}>
        {!failed?<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:'100%'}} contentFit="contain" transition={150}/>:<Icon name="grid" size={32} color={colors.muted}/>}
      </View>
      <View style={{minHeight:44,paddingHorizontal:12,paddingVertical:8,gap:8,flexDirection:'row',alignItems:'center',borderTopWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
        <Text numberOfLines={1} style={{flex:1,fontSize:14,fontWeight:'600',color:colors.ink}}>{app.buttonTitle}</Text><FarcasterIcon/><Icon name="arrow-up-right" size={16} color={colors.muted}/>
      </View>
    </Pressable>
    {!!error&&<Text accessibilityRole="alert" style={{fontSize:12,color:colors.danger}}>{error}</Text>}
  </View>;
}
