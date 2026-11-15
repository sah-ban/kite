import {Image} from 'expo-image';
import {router} from 'expo-router';
import {memo,useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import {castTextParts} from '../../../src/lib/mentions';
import {type Cast,castDate,castKey,castRoute,isFid,relativeTime,safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar,Icon,space} from './ui';
import {CastActions} from './CastActions';
import {CastMenu} from './CastMenu';
import {ClientLabel} from './ClientLabel';

export async function openLink(value:string){const url=safeLink(value);if(url)await Linking.openURL(url).catch(()=>{});}
export function Person({fid,compact=false,dense=false,showAvatar=true}:{fid:number;compact?:boolean;dense?:boolean;showAvatar?:boolean}) {
  const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/profile/${fid}`);}} accessibilityRole="link" accessibilityLabel={`View ${value?.name||`FID ${fid}`}`} style={[space.row,{flex:1,minHeight:compact?32:dense?40:52}]}>{showAvatar&&<Avatar url={value?.avatar} size={compact?32:dense?40:42}/>}<View style={space.grow}><Text numberOfLines={1} style={{color:colors.ink,fontSize:compact?14:16,fontWeight:'600'}}>{value?.name||`FID ${fid}`}</Text>{!compact&&!!value?.username&&<Text numberOfLines={1} style={{color:colors.muted,fontSize:dense?12:13}}>@{value.username}</Text>}</View></Pressable>;
}
function AuthorAvatar({fid}:{fid:number}){
  const {api}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/profile/${fid}`);}} accessibilityRole="link" accessibilityLabel={`View ${value?.name||`FID ${fid}`}`} style={{width:40,alignSelf:'flex-start'}}><Avatar url={value?.avatar} size={40}/></Pressable>;
}
function Mention({fid}:{fid:number}){const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);return <Text style={{color:colors.accent,fontWeight:'500'}} onPress={event=>{event.stopPropagation();router.push(`/profile/${fid}`);}}>@{value?.username||fid}</Text>;}
export function CastText({cast,limit=Infinity}:{cast:Cast;limit?:number}) {
  const {colors}=useApp();const body=cast.data.castAddBody;
  const {parts}=castTextParts(body.text,body.mentions,body.mentionsPositions,limit);
  return <Text selectable style={{fontSize:16,lineHeight:22,color:colors.ink}}>{parts.map((part,index)=>'fid' in part&&isFid(part.fid)?<Mention key={index} fid={part.fid}/>:part.text)}</Text>;
}
function UrlEmbed({url,castUrls}:{url:string;castUrls:string[]}) {
  const {api,colors}=useApp(),{value}=useQuery(signal=>api.embed(url,signal),[api,url]);
  const [failed,setFailed]=useState(false);
  const normalized=safeLink(url);if(!normalized)return null;
  const image=value?.kind==='image'?safeLink(value.url):value?.image?safeLink(value.image):value?.poster?safeLink(value.poster):undefined;
  const viewImage=value?.kind==='image'&&image;
  const viewVideo=value?.kind==='video'&&safeLink(value.url);
  return <Pressable onPress={event=>{event.stopPropagation();if(viewImage)router.push({pathname:'/image',params:{url:viewImage,source:normalized,embeds:JSON.stringify(castUrls)}});else if(viewVideo)router.push({pathname:'/video',params:{url:viewVideo,...(value?.contentType?{contentType:value.contentType}:{})}});else void openLink(normalized);}} accessibilityRole="link" accessibilityLabel={viewImage?'View image':viewVideo?'Play video':value?.title||`Open ${new URL(normalized).hostname}`} style={{borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft}}>
    {viewVideo?<View style={{height:200,backgroundColor:'#000',justifyContent:'center',alignItems:'center'}}>{image&&!failed&&<Image source={{uri:image}} onError={()=>setFailed(true)} style={{position:'absolute',width:'100%',height:'100%'}} contentFit="cover" transition={150}/>}<View pointerEvents="none" style={{width:54,height:54,borderRadius:27,backgroundColor:'#00000099',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={25} color="#fff"/></View></View>:image&&!failed&&<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:200}} contentFit="cover" transition={150}/>}
    {value?.kind!=='image'&&<View style={{padding:12,gap:4}}><Text numberOfLines={1} style={{color:colors.muted,fontSize:12}}>{value?.kind==='video'?'▶ Video · ':''}{new URL(normalized).hostname}</Text><Text numberOfLines={2} style={{color:colors.ink,fontSize:14,fontWeight:'500'}}>{value?.title||normalized}</Text></View>}
  </Pressable>;
}
function Quote({fid,hash}:{fid:number;hash:string}){
  const {api,colors}=useApp(),{value,error}=useQuery(signal=>api.resolveCast(String(fid),hash,signal),[api,fid,hash]);
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/cast/${fid}/${hash}`);}} accessibilityRole="link" accessibilityLabel="Open quoted cast" style={{padding:12,borderRadius:14,borderWidth:1,borderColor:colors.line,gap:8}}><Person fid={fid} compact/>{value?<CastText cast={value} limit={280}/>:<Text style={{color:colors.muted}}>{error?'Quoted cast unavailable':'Loading quoted cast…'}</Text>}</Pressable>;
}
export const CastCard=memo(function CastCard({cast,expanded=false,loadActivity=true}:{cast:Cast;expanded?:boolean;loadActivity?:boolean}){
  const {colors,deletedCasts}=useApp();const body=cast.data.castAddBody;
  const [textExpanded,setTextExpanded]=useState(false);
  if(deletedCasts.has(castKey(cast)))return null;
  const route=()=>router.push(castRoute(cast));
  const embeds=body.embeds?.length?body.embeds:(body.embedsDeprecated||[]).map(url=>({url}));
  const castUrls=embeds.slice(0,4).flatMap(embed=>embed.url?[embed.url]:[]);
  return <Pressable accessible={false} focusable={false} onPress={expanded?undefined:route} style={{borderBottomWidth:1,borderColor:colors.line,paddingHorizontal:18,paddingVertical:expanded?14:12,flexDirection:expanded?'column':'row',gap:10,backgroundColor:colors.surface}}>
    {!expanded&&<AuthorAvatar fid={cast.data.fid}/>}
    <View style={{flex:expanded?undefined:1,minWidth:0,gap:expanded?8:6}}>
    <View style={[space.row,{gap:6}]}><Person fid={cast.data.fid} dense={!expanded} showAvatar={expanded}/>{!expanded&&<Text style={{color:colors.muted,fontSize:12}}>{relativeTime(cast.data.timestamp)}</Text>}<CastMenu cast={cast}/></View>
    <Pressable onPress={expanded?undefined:event=>{event.stopPropagation();route();}} disabled={expanded} accessibilityRole={expanded?undefined:'link'} accessibilityLabel={expanded?undefined:'Open conversation'}><CastText cast={cast} limit={expanded||textExpanded?Infinity:500}/></Pressable>
    {!expanded&&Array.from(body.text).length>500&&<Pressable onPress={event=>{event.stopPropagation();setTextExpanded(value=>!value);}} accessibilityRole="button" accessibilityLabel={textExpanded?'Collapse cast text':'Read full cast'} aria-expanded={textExpanded} style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{color:colors.accent,fontSize:14,fontWeight:'600'}}>{textExpanded?'Show less':'Read more'}</Text></Pressable>}
    {embeds.slice(0,4).map((embed,index)=>'castId' in embed&&embed.castId?<Quote key={index} {...embed.castId}/>:embed.url?<UrlEmbed key={`${index}:${embed.url}`} url={embed.url} castUrls={castUrls}/>:null)}
    {expanded&&<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-start',columnGap:12,rowGap:4,marginTop:4}}>
      <Text style={{fontSize:12,lineHeight:18,color:colors.muted}}>{castDate(cast.data.timestamp).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</Text>
      <View style={{marginLeft:'auto',maxWidth:'100%'}}><ClientLabel fid={cast.data.fid} signer={cast.signer}/></View>
    </View>}
    <CastActions cast={cast} enabled={loadActivity}/>
    </View>
  </Pressable>;
});
