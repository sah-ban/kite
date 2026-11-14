import {Image} from 'expo-image';
import {router} from 'expo-router';
import {memo,useState} from 'react';
import {Linking,Pressable,Share,Text,View} from 'react-native';
import {castTextParts} from '../../../src/lib/mentions';
import {type Cast,castDate,castRoute,isFid,relativeTime,safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar,Icon,space} from './ui';

export async function openLink(value:string){const url=safeLink(value);if(url)await Linking.openURL(url).catch(()=>{});}
export function Person({fid,compact=false,dense=false}:{fid:number;compact?:boolean;dense?:boolean}) {
  const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);
  return <Pressable onPress={()=>router.push(`/profile/${fid}`)} accessibilityRole="link" accessibilityLabel={`View ${value?.name||`FID ${fid}`}`} style={[space.row,{flex:1,minHeight:compact?32:dense?40:52}]}><Avatar url={value?.avatar} size={compact?32:dense?40:42}/><View style={space.grow}><Text numberOfLines={1} style={{color:colors.ink,fontSize:compact?14:16,fontWeight:'600'}}>{value?.name||`FID ${fid}`}</Text>{!compact&&!!value?.username&&<Text numberOfLines={1} style={{color:colors.muted,fontSize:dense?12:13}}>@{value.username}</Text>}</View></Pressable>;
}
function Mention({fid}:{fid:number}){const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);return <Text style={{color:colors.accent,fontWeight:'500'}} onPress={()=>router.push(`/profile/${fid}`)}>@{value?.username||fid}</Text>;}
function CastText({cast,limit=Infinity}:{cast:Cast;limit?:number}) {
  const {colors}=useApp();const body=cast.data.castAddBody;
  const {parts}=castTextParts(body.text,body.mentions,body.mentionsPositions,limit);
  return <Text selectable style={{fontSize:16,lineHeight:22,color:colors.ink}}>{parts.map((part,index)=>'fid' in part&&isFid(part.fid)?<Mention key={index} fid={part.fid}/>:part.text)}</Text>;
}
function UrlEmbed({url}:{url:string}) {
  const {api,colors}=useApp(),{value}=useQuery(signal=>api.embed(url,signal),[api,url]);
  const [failed,setFailed]=useState(false);
  const normalized=safeLink(url);if(!normalized)return null;
  const image=value?.kind==='image'?safeLink(value.url):value?.image?safeLink(value.image):value?.poster?safeLink(value.poster):undefined;
  return <Pressable onPress={()=>void openLink(normalized)} accessibilityRole="link" accessibilityLabel={value?.title||`Open ${new URL(normalized).hostname}`} style={{borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft}}>
    {image&&!failed&&<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:200}} contentFit="cover" transition={150}/>}
    {value?.kind!=='image'&&<View style={{padding:12,gap:4}}><Text numberOfLines={1} style={{color:colors.muted,fontSize:12}}>{value?.kind==='video'?'▶ Video · ':''}{new URL(normalized).hostname}</Text><Text numberOfLines={2} style={{color:colors.ink,fontSize:14,fontWeight:'500'}}>{value?.title||normalized}</Text></View>}
  </Pressable>;
}
function Quote({fid,hash}:{fid:number;hash:string}){
  const {api,colors}=useApp(),{value,error}=useQuery(signal=>api.resolveCast(String(fid),hash,signal),[api,fid,hash]);
  return <Pressable onPress={()=>router.push(`/cast/${fid}/${hash}`)} accessibilityRole="link" accessibilityLabel="Open quoted cast" style={{padding:12,borderRadius:14,borderWidth:1,borderColor:colors.line,gap:8}}><Person fid={fid} compact/>{value?<CastText cast={value} limit={280}/>:<Text style={{color:colors.muted}}>{error?'Quoted cast unavailable':'Loading quoted cast…'}</Text>}</Pressable>;
}
export const CastCard=memo(function CastCard({cast,expanded=false}:{cast:Cast;expanded?:boolean}){
  const {colors}=useApp();const body=cast.data.castAddBody;
  const route=()=>router.push(castRoute(cast));
  const embeds=body.embeds?.length?body.embeds:(body.embedsDeprecated||[]).map(url=>({url}));
  return <View style={{borderBottomWidth:1,borderColor:colors.line,paddingHorizontal:18,paddingVertical:expanded?14:12,gap:expanded?8:6,backgroundColor:colors.surface}}>
    <View style={space.row}><Person fid={cast.data.fid} dense={!expanded}/>{!expanded&&<Text style={{color:colors.muted,fontSize:12}}>{relativeTime(cast.data.timestamp)}</Text>}</View>
    <Pressable onPress={expanded?undefined:route} disabled={expanded} accessibilityRole={expanded?undefined:'link'} accessibilityLabel={expanded?undefined:'Open conversation'}><CastText cast={cast} limit={expanded?Infinity:500}/></Pressable>
    {!expanded&&Array.from(body.text).length>500&&<Pressable onPress={route} accessibilityRole="link" accessibilityLabel="Read full cast" style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{color:colors.accent,fontSize:14,fontWeight:'600'}}>Read more</Text></Pressable>}
    {embeds.slice(0,4).map((embed,index)=>'castId' in embed&&embed.castId?<Quote key={index} {...embed.castId}/>:embed.url?<UrlEmbed key={`${index}:${embed.url}`} url={embed.url}/>:null)}
    {expanded&&<Text style={{fontSize:12,color:colors.muted,marginTop:4}}>{castDate(cast.data.timestamp).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</Text>}
    <View style={{flexDirection:'row',justifyContent:'space-between',paddingTop:2}}>
      <Pressable onPress={route} accessibilityRole="link" accessibilityLabel="View replies" style={[space.row,{minHeight:36,paddingRight:20}]}><Icon name="message-circle" size={17} color={colors.muted}/><Text style={{fontSize:12,color:colors.muted}}>Conversation</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Share cast" hitSlop={8} onPress={()=>void Share.share({message:`https://kite.sahban.dev${castRoute(cast)}`}).catch(()=>{})} style={{minWidth:40,minHeight:36,alignItems:'center',justifyContent:'center'}}><Icon name="share" size={17} color={colors.muted}/></Pressable>
    </View>
  </View>;
});
