import {Image} from 'expo-image';
import {router,Stack,useLocalSearchParams} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useState} from 'react';
import {ActivityIndicator,Pressable,Share,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {safeLink} from '../lib/model';
import {Icon} from '../components/ui';

export default function ImageScreen(){
  const {url}=useLocalSearchParams<{url?:string}>();
  const source=typeof url==='string'?safeLink(url):undefined;
  return <ImageViewer key={source||'invalid'} url={source}/>;
}
function ImageViewer({url}:{url?:string}){
  const insets=useSafeAreaInsets();
  const [loading,setLoading]=useState(!!url),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[notice,setNotice]=useState('');
  function close(){if(router.canGoBack())router.back();else router.replace('/');}
  async function share(){if(!url)return;try{await Share.share({message:url});}catch{setNotice('Couldn’t share this image. Please try again.');}}
  return <View style={{flex:1,backgroundColor:'#000',paddingTop:insets.top,paddingBottom:insets.bottom}}>
    <Stack.Screen options={{headerShown:false,presentation:'fullScreenModal',contentStyle:{backgroundColor:'#000'}}}/>
    <StatusBar style="light"/>
    <View style={{height:56,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={close} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={24} color="#fff"/></Pressable>
      <Text style={{color:'#fff',fontSize:16,fontWeight:'600'}}>Image</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Share image" disabled={!url} onPress={()=>void share()} style={{width:44,height:44,alignItems:'center',justifyContent:'center',opacity:url?1:.4}}><Icon name="share" size={21} color="#fff"/></Pressable>
    </View>
    <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
      {url&&!failed&&<Image key={revision} source={{uri:url}} accessibilityLabel="Cast image" contentFit="contain" style={{width:'100%',height:'100%'}} onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true);}}/>}
      {url&&loading&&!failed&&<ActivityIndicator accessibilityLabel="Loading image" color="#fff" style={{position:'absolute'}}/>}
      {(!url||failed)&&<View style={{padding:24,gap:16,alignItems:'center'}}><Icon name="image" size={32} color="#aaa"/><Text accessibilityRole="alert" style={{color:'#fff',fontSize:16,textAlign:'center'}}>This image couldn’t be loaded.</Text>{url&&<Pressable accessibilityRole="button" accessibilityLabel="Retry image" onPress={()=>{setFailed(false);setLoading(true);setRevision(value=>value+1);}} style={{minHeight:44,justifyContent:'center',paddingHorizontal:20,borderRadius:12,backgroundColor:'#262626'}}><Text style={{color:'#fff',fontSize:15,fontWeight:'600'}}>Try again</Text></Pressable>}</View>}
    </View>
    {!!notice&&<Text accessibilityRole="alert" style={{color:'#fff',textAlign:'center',fontSize:13,padding:14}}>{notice}</Text>}
  </View>;
}
