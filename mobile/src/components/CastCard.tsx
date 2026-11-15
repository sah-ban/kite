import {Image} from 'expo-image';
import {router} from 'expo-router';
import {memo,useState} from 'react';
import {Linking,Pressable,ScrollView,Text,View} from 'react-native';
import {castTextParts} from '../../../src/lib/mentions';
import {type Cast,castDate,castKey,castRoute,isFid,relativeTime,safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar,space} from './ui';
import {InlineVideo} from './InlineVideo';
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
function UrlEmbed({url,castUrls,visible}:{url:string;castUrls:string[];visible:boolean}) {
  const {api,colors}=useApp(),{value}=useQuery(signal=>api.embed(url,signal),[api,url]);
  const [failed,setFailed]=useState(false);
  const normalized=safeLink(url);if(!normalized)return null;
  const image=value?.kind==='image'?safeLink(value.url):value?.image?safeLink(value.image):value?.poster?safeLink(value.poster):undefined;
  const viewImage=value?.kind==='image'&&image;
  const viewVideo=value?.kind==='video'&&safeLink(value.url);
  if(viewVideo)return <InlineVideo key={`${viewVideo}:${visible}`} url={viewVideo} contentType={value?.contentType} poster={image} autoPlay={visible}/>;
  return <Pressable onPress={event=>{event.stopPropagation();if(viewImage)router.push({pathname:'/image',params:{url:viewImage,source:normalized,embeds:JSON.stringify(castUrls)}});else void openLink(normalized);}} accessibilityRole="link" accessibilityLabel={viewImage?'View image':value?.title||`Open ${new URL(normalized).hostname}`} style={{borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft}}>
    {image&&!failed&&<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:200}} contentFit="cover" transition={150}/>}
    {!viewImage&&<View style={{padding:12,gap:4}}><Text numberOfLines={1} style={{color:colors.muted,fontSize:12}}>{new URL(normalized).hostname}</Text><Text numberOfLines={2} style={{color:colors.ink,fontSize:14,fontWeight:'500'}}>{value?.title||normalized}</Text></View>}
  </Pressable>;
}
function Quote({fid,hash}:{fid:number;hash:string}){
  const {api,colors}=useApp(),{value,error}=useQuery(signal=>api.resolveCast(String(fid),hash,signal),[api,fid,hash]);
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/cast/${fid}/${hash}`);}} accessibilityRole="link" accessibilityLabel="Open quoted cast" style={{padding:12,borderRadius:14,borderWidth:1,borderColor:colors.line,gap:8}}><Person fid={fid} compact/>{value?<CastText cast={value} limit={280}/>:<Text style={{color:colors.muted}}>{error?'Quoted cast unavailable':'Loading quoted cast…'}</Text>}</Pressable>;
}
function CastEmbeds({embeds,visible,gutter}:{embeds:NonNullable<Cast['data']['castAddBody']['embeds']>;visible:boolean;gutter:number}){
  const [width,setWidth]=useState(0),[offset,setOffset]=useState(0);
  const items=embeds.slice(0,4),urls=items.flatMap(embed=>!embed.castId&&embed.url?[embed.url]:[]),quotes=items.flatMap(embed=>embed.castId?[embed.castId]:[]);
  const itemWidth=Math.max(160,(width-gutter)*.88),gap=10;
  const activeIndex=Math.max(0,Math.min(urls.length-1,Math.round(offset/(itemWidth+gap))));
  return <View style={{gap:8,minWidth:0,marginLeft:-gutter}}>
    {urls.length>0&&<View onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
      {urls.length===1?<View style={{marginLeft:gutter}}><UrlEmbed url={urls[0]} castUrls={urls} visible={visible}/></View>:width>0&&<ScrollView horizontal accessibilityLabel="Cast embeds" showsHorizontalScrollIndicator={false} nestedScrollEnabled directionalLockEnabled decelerationRate="fast" snapToInterval={itemWidth+gap} snapToAlignment="start" scrollEventThrottle={32} onScroll={event=>setOffset(event.nativeEvent.contentOffset.x)} contentContainerStyle={{gap,paddingLeft:gutter,alignItems:'flex-start'}}>
        {urls.map((url,index)=><View key={`${index}:${url}`} style={{width:itemWidth}}><UrlEmbed url={url} castUrls={urls} visible={visible&&index===activeIndex}/></View>)}
      </ScrollView>}
    </View>}
    {quotes.map((quote,index)=><View key={`${index}:${quote.fid}:${quote.hash}`} style={{marginLeft:gutter}}><Quote {...quote}/></View>)}
  </View>;
}
export const CastCard=memo(function CastCard({cast,expanded=false,loadActivity=true}:{cast:Cast;expanded?:boolean;loadActivity?:boolean}){
  const {colors,deletedCasts}=useApp();const body=cast.data.castAddBody;
  const [textExpanded,setTextExpanded]=useState(false);
  if(deletedCasts.has(castKey(cast)))return null;
  const route=()=>router.push(castRoute(cast));
  const embeds=body.embeds?.length?body.embeds:(body.embedsDeprecated||[]).map(url=>({url}));
  const Container=expanded?View:Pressable;
  return <Container accessible={false} focusable={false} {...(expanded?{}:{onPress:route})} style={{borderBottomWidth:1,borderColor:colors.line,paddingHorizontal:18,paddingVertical:expanded?14:12,flexDirection:'column',gap:10,backgroundColor:colors.surface}}>
    {!expanded&&<View style={{position:'absolute',left:18,top:12,width:40,height:40,zIndex:1}}><AuthorAvatar fid={cast.data.fid}/></View>}
    <View style={{minWidth:0,paddingLeft:expanded?0:50,gap:expanded?8:6}}>
    <View style={[space.row,{gap:6}]}><Person fid={cast.data.fid} dense={!expanded} showAvatar={expanded}/>{!expanded&&<Text style={{color:colors.muted,fontSize:12}}>{relativeTime(cast.data.timestamp)}</Text>}<CastMenu cast={cast}/></View>
    {expanded?<CastText cast={cast}/>:<Pressable onPress={event=>{event.stopPropagation();route();}} accessibilityRole="link" accessibilityLabel="Open conversation"><CastText cast={cast} limit={textExpanded?Infinity:500}/></Pressable>}
    {!expanded&&Array.from(body.text).length>500&&<Pressable onPress={event=>{event.stopPropagation();setTextExpanded(value=>!value);}} accessibilityRole="button" accessibilityLabel={textExpanded?'Collapse cast text':'Read full cast'} aria-expanded={textExpanded} style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{color:colors.accent,fontSize:14,fontWeight:'600'}}>{textExpanded?'Show less':'Read more'}</Text></Pressable>}
    {embeds.length>0&&<CastEmbeds embeds={embeds} visible={loadActivity} gutter={expanded?0:50}/>}
    {expanded&&<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-start',columnGap:12,rowGap:4,marginTop:4}}>
      <Text style={{fontSize:12,lineHeight:18,color:colors.muted}}>{castDate(cast.data.timestamp).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</Text>
      <View style={{marginLeft:'auto',maxWidth:'100%'}}><ClientLabel fid={cast.data.fid} signer={cast.signer}/></View>
    </View>}
    <CastActions cast={cast} enabled={loadActivity}/>
    </View>
  </Container>;
});
