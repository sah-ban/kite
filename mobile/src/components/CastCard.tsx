import {Image} from 'expo-image';
import {router} from 'expo-router';
import {memo,useState} from 'react';
import {Linking,Pressable,ScrollView,Text,View} from 'react-native';
import {castTextParts} from '../../../src/lib/mentions';
import {type Cast,castDate,castKey,castRoute,isFid,relativeTime,safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {Avatar,Icon,space} from './ui';
import {InlineVideo} from './InlineVideo';
import {CastActions} from './CastActions';
import {QuoteIcon} from './CastActionIcons';
import {CastMenu} from './CastMenu';
import {ClientLabel} from './ClientLabel';
import {MiniAppEmbed} from './MiniAppEmbed';
import {miniAppLaunchURL} from '../lib/miniapp';
import {TweetEmbed} from './TweetEmbed';
import {xPostLink} from '../lib/x-post';

export async function openLink(value:string){const url=safeLink(value);if(url)await Linking.openURL(url).catch(()=>{});}
export function Person({fid,compact=false,dense=false,showAvatar=true,usernameOnly=false,profileLink=true}:{fid:number;compact?:boolean;dense?:boolean;showAvatar?:boolean;usernameOnly?:boolean;profileLink?:boolean}) {
  const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);
  const Container=profileLink?Pressable:View;
  return <Container {...(profileLink?{onPress:(event:import('react-native').GestureResponderEvent)=>{event.stopPropagation();router.push(`/profile/${fid}`);},accessibilityRole:'link' as const,accessibilityLabel:`View ${value?.name||`FID ${fid}`}`}:{})} style={[space.row,{flex:1,minHeight:compact?32:dense?40:52}]}>{showAvatar&&<Avatar url={value?.avatar} size={compact?32:dense?40:42}/>}<View style={space.grow}><Text numberOfLines={1} style={{color:colors.ink,fontSize:compact?14:16,fontWeight:'600'}}>{usernameOnly?(value?.username?`@${value.username}`:`FID ${fid}`):value?.name||`FID ${fid}`}</Text>{!compact&&!usernameOnly&&!!value?.username&&<Text numberOfLines={1} style={{color:colors.muted,fontSize:dense?12:13}}>@{value.username}</Text>}</View></Container>;
}
function AuthorAvatar({fid}:{fid:number}){
  const {api}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/profile/${fid}`);}} accessibilityRole="link" accessibilityLabel={`View ${value?.name||`FID ${fid}`}`} style={{width:40,alignSelf:'flex-start'}}><Avatar url={value?.avatar} size={40}/></Pressable>;
}
function Mention({fid}:{fid:number}){const {api,colors}=useApp(),{value}=useQuery(()=>api.profile(fid),[api,fid]);return <Text style={{color:colors.accent,fontWeight:'500'}} onPress={event=>{event.stopPropagation();router.push(`/profile/${fid}`);}}>@{value?.username||fid}</Text>;}
export function CastText({cast,limit=Infinity,compact=false,numberOfLines,expansion}:{cast:Cast;limit?:number;compact?:boolean;numberOfLines?:number;expansion?:{expanded:boolean;onPress:()=>void}}) {
  const {colors}=useApp();const body=cast.data.castAddBody;
  const {parts}=castTextParts(body.text,body.mentions,body.mentionsPositions,limit);
  // Keep clamped previews non-selectable so Android can draw the trailing ellipsis.
  return <Text selectable={numberOfLines===undefined} numberOfLines={numberOfLines} ellipsizeMode="tail" style={{fontSize:16,lineHeight:compact?21:22,color:colors.ink}}>{parts.map((part,index)=>'fid' in part&&isFid(part.fid)?<Mention key={index} fid={part.fid}/>:part.text)}{expansion&&<>{' '}<Text accessibilityRole="button" accessibilityLabel={expansion.expanded?'Show less':'Show more'} accessibilityState={{expanded:expansion.expanded}} onPress={event=>{event.stopPropagation();expansion.onPress();}} style={{color:colors.accent,fontSize:14,fontWeight:'600'}}>{expansion.expanded?'Show\u00a0less':'Show\u00a0more'}</Text></>}</Text>;
}
function UrlEmbed({url,castUrls,visible,height,width}:{url:string;castUrls:string[];visible:boolean;height?:number;width?:number}) {
  const {api,colors}=useApp(),{value}=useQuery(signal=>api.embed(url,signal),[api,url]);
  const [failed,setFailed]=useState(false);
  const [imageRatio,setImageRatio]=useState(1);
  const normalized=safeLink(url);if(!normalized)return null;
  if(value?.tweet&&xPostLink(value.tweet.url))return <View style={{width}}><TweetEmbed key={value.tweet.url} post={value.tweet} height={height}/></View>;
  if(value?.miniapp&&miniAppLaunchURL(value.miniapp.url)&&safeLink(value.miniapp.imageUrl))return <View style={{width}}><MiniAppEmbed key={value.miniapp.imageUrl} app={value.miniapp} height={height}/></View>;
  const image=value?.kind==='image'?safeLink(value.url):value?.image?safeLink(value.image):value?.poster?safeLink(value.poster):undefined;
  const viewImage=value?.kind==='image'&&image;
  const viewVideo=value?.kind==='video'&&safeLink(value.url);
  if(viewVideo)return <View style={{width}}><InlineVideo key={`${viewVideo}:${visible}`} url={viewVideo} contentType={value?.contentType} poster={image} autoPlay={visible} height={height}/></View>;
  if(viewImage&&!failed){
    const imageWidth=Math.min(width||300,((height||200)-2)*imageRatio+2);
    return <Pressable onPress={event=>{event.stopPropagation();router.push({pathname:'/image',params:{url:viewImage,source:normalized,embeds:JSON.stringify(castUrls)}});}} accessibilityRole="link" accessibilityLabel="View image" style={{width:imageWidth,height:(imageWidth-2)/imageRatio+2,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft}}>
      <Image source={{uri:viewImage}} onLoad={({source})=>{if(source.width>0&&source.height>0)setImageRatio(source.width/source.height);}} onError={()=>setFailed(true)} style={{width:'100%',height:'100%'}} contentFit="contain" transition={150}/>
    </Pressable>;
  }
  return <Pressable onPress={event=>{event.stopPropagation();if(viewImage)router.push({pathname:'/image',params:{url:viewImage,source:normalized,embeds:JSON.stringify(castUrls)}});else void openLink(normalized);}} accessibilityRole="link" accessibilityLabel={viewImage?'View image':value?.title||`Open ${new URL(normalized).hostname}`} style={{width,height,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.soft}}>
    {image&&!failed?<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:height?undefined:viewImage?200:undefined,aspectRatio:!height&&!viewImage?1.91:undefined,flex:height?1:undefined,minHeight:0}} contentFit="contain" transition={150}/>:<View accessibilityRole="image" accessibilityLabel={viewImage?'Image unavailable':`Website preview for ${new URL(normalized).hostname}`} style={{height:height?undefined:viewImage?200:150,flex:height?1:undefined,minHeight:0,padding:16,gap:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.soft}}><View style={{width:56,height:56,borderRadius:18,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={viewImage?'image':'globe'} size={28} color={colors.accent}/></View><Text numberOfLines={2} style={{fontSize:13,lineHeight:18,fontWeight:'500',color:colors.muted,textAlign:'center'}}>{viewImage?'Image unavailable':value?.site||new URL(normalized).hostname}</Text></View>}
    {!viewImage&&<View style={{padding:10,gap:2}}><Text numberOfLines={1} style={{color:colors.muted,fontSize:12}}>{new URL(normalized).hostname}</Text><Text numberOfLines={2} style={{color:colors.ink,fontSize:14,fontWeight:'500'}}>{value?.title||normalized}</Text></View>}
  </Pressable>;
}
type QuoteEmbed=NonNullable<Cast['data']['castAddBody']['embeds']>[number];
function QuoteThumbnail({embed}:{embed:QuoteEmbed}){
  const {api,colors}=useApp(),url=embed.url?safeLink(embed.url):undefined;
  const {value}=useQuery(signal=>url?api.embed(url,signal):Promise.resolve(undefined),[api,url]);
  const [failed,setFailed]=useState('');
  const image=safeLink(value?.miniapp?.imageUrl||(value?.kind==='image'?value.url:value?.image||value?.poster)||'');
  const kind=embed.castId?'quote':value?.kind||'link';
  return <View accessibilityRole="image" accessibilityLabel={kind==='image'?'Quoted cast image':kind==='video'?'Quoted video preview':kind==='quote'?'Nested quoted cast':'Quoted website preview'} style={{width:'100%',height:'100%',borderRadius:10,overflow:'hidden',backgroundColor:colors.soft,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'}}>
    {image&&failed!==image?<Image source={{uri:image}} onError={()=>setFailed(image)} style={{width:'100%',height:'100%'}} contentFit="cover" transition={150}/>:kind==='quote'?<QuoteIcon size={22} color={colors.muted}/>:<Icon name={kind==='image'?'image':kind==='video'?'video':'globe'} size={22} color={colors.muted}/>}
    {kind==='video'&&image&&failed!==image&&<View style={{position:'absolute',width:28,height:28,borderRadius:14,backgroundColor:'#00000088',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={15} color="#fff"/></View>}
    {kind==='link'&&image&&failed!==image&&<View pointerEvents="none" style={{position:'absolute',right:4,bottom:4,width:22,height:22,borderRadius:11,backgroundColor:'#000000aa',alignItems:'center',justifyContent:'center'}}><Icon name="globe" size={13} color="#fff"/></View>}
  </View>;
}
export function Quote({fid,hash}:{fid:number;hash:string}){
  const {api,colors}=useApp(),{value,error}=useQuery(signal=>api.resolveCast(String(fid),hash,signal),[api,fid,hash]);
  const body=value?.data.castAddBody;
  const attachments:QuoteEmbed[]=body?.embeds?.length?body.embeds:(body?.embedsDeprecated||[]).map(url=>({url}));
  const embeds=attachments.filter(embed=>embed.castId||embed.url&&safeLink(embed.url)).slice(0,4);
  const text=value&&!!(body?.text||body?.mentions?.length)?<CastText cast={value} limit={280} numberOfLines={5} compact/>:null;
  return <Pressable onPress={event=>{event.stopPropagation();router.push(`/cast/${fid}/${hash}`);}} accessibilityRole="link" accessibilityLabel="Open quoted cast" style={{padding:10,borderRadius:14,borderWidth:1,borderColor:colors.line,gap:6}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Person fid={fid} compact usernameOnly profileLink={false}/>{value&&<Text style={{fontSize:11,color:colors.muted,flexShrink:0}}>{relativeTime(value.data.timestamp)}</Text>}</View>
    {!value?<Text style={{color:colors.muted}}>{error?'Quoted cast unavailable':'Loading quoted cast…'}</Text>:embeds.length===1?<View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><View style={{width:76,height:76,flexShrink:0}}><QuoteThumbnail embed={embeds[0]}/></View><View style={{flex:1,minWidth:0}}>{text}</View></View>:<>{text}{embeds.length>1&&<View style={{flexDirection:'row',gap:6}}>{embeds.map((embed,index)=><View key={`${index}:${embed.url||embed.castId?.hash}`} style={{flex:1,minWidth:0,maxWidth:96,aspectRatio:1}}><QuoteThumbnail embed={embed}/></View>)}</View>}</>}
  </Pressable>;
}
function CastEmbeds({embeds,visible,gutter}:{embeds:NonNullable<Cast['data']['castAddBody']['embeds']>;visible:boolean;gutter:number}){
  const [width,setWidth]=useState(0),[offset,setOffset]=useState(0);
  const [itemWidths,setItemWidths]=useState<Record<string,number>>({});
  const items=embeds.slice(0,4);
  const urls=items.flatMap(embed=>!embed.castId&&embed.url&&!xPostLink(embed.url)?[embed.url]:[]);
  const previews=items.filter(embed=>embed.castId||embed.url&&xPostLink(embed.url));
  const itemWidth=Math.max(160,(width-gutter)*.88),gap=8;
  const offsets=urls.map((_,index)=>urls.slice(0,index).reduce((total,url)=>total+(itemWidths[url]||itemWidth)+gap,0));
  const activeIndex=offsets.reduce((nearest,start,index)=>Math.abs(start-offset)<Math.abs(offsets[nearest]-offset)?index:nearest,0);
  return <View style={{gap:6,minWidth:0,marginLeft:-gutter}}>
    {urls.length>0&&<View onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
      {urls.length===1?<View style={{marginLeft:gutter}}><UrlEmbed key={urls[0]} url={urls[0]} castUrls={urls} visible={visible} width={width>gutter?width-gutter:undefined}/></View>:width>0&&<ScrollView horizontal accessibilityLabel="Cast embeds" showsHorizontalScrollIndicator={false} nestedScrollEnabled directionalLockEnabled decelerationRate="fast" snapToOffsets={offsets} snapToAlignment="start" scrollEventThrottle={32} onScroll={event=>setOffset(event.nativeEvent.contentOffset.x)} contentContainerStyle={{gap,paddingLeft:gutter,alignItems:'flex-start'}}>
        {urls.map((url,index)=><View key={`${index}:${url}`} onLayout={event=>{const measured=event.nativeEvent.layout.width;setItemWidths(previous=>previous[url]===measured?previous:{...previous,[url]:measured});}}><UrlEmbed url={url} castUrls={urls} visible={visible&&index===activeIndex} height={210} width={itemWidth}/></View>)}
      </ScrollView>}
    </View>}
    {previews.map((embed,index)=><View key={`${index}:${embed.castId?.hash||embed.url}`} style={{marginLeft:gutter}}>{embed.castId?<Quote {...embed.castId}/>:embed.url?<UrlEmbed url={embed.url} castUrls={urls} visible={visible}/>:null}</View>)}
  </View>;
}
export const CastCard=memo(function CastCard({cast,expanded=false,loadActivity=true}:{cast:Cast;expanded?:boolean;loadActivity?:boolean}){
  const {colors,deletedCasts}=useApp();const body=cast.data.castAddBody;
  const [textExpanded,setTextExpanded]=useState(false);
  if(deletedCasts.has(castKey(cast)))return null;
  const route=()=>router.push(castRoute(cast));
  const embeds=body.embeds?.length?body.embeds:(body.embedsDeprecated||[]).map(url=>({url}));
  const canExpand=!expanded&&Array.from(body.text).length>500;
  const Container=expanded?View:Pressable;
  return <Container accessible={false} focusable={false} {...(expanded?{}:{onPress:route})} style={{borderBottomWidth:1,borderColor:colors.line,paddingHorizontal:14,paddingTop:expanded?10:8,paddingBottom:2,flexDirection:'column',backgroundColor:colors.surface}}>
    {!expanded&&<View style={{position:'absolute',left:14,top:8,width:40,height:40,zIndex:1}}><AuthorAvatar fid={cast.data.fid}/></View>}
    <View style={{minWidth:0,paddingLeft:expanded?0:48,gap:expanded?4:2}}>
    <View style={[space.row,{gap:6}]}><Person fid={cast.data.fid} dense showAvatar={expanded}/>{!expanded&&<Text style={{color:colors.muted,fontSize:12}}>{relativeTime(cast.data.timestamp)}</Text>}<CastMenu cast={cast}/></View>
    {!!(body.text||body.mentions?.length)&&(expanded?<CastText cast={cast} compact/>:<Pressable onPress={event=>{event.stopPropagation();route();}} accessibilityRole="link" accessibilityLabel="Open conversation"><CastText cast={cast} limit={textExpanded?Infinity:500} compact expansion={canExpand?{expanded:textExpanded,onPress:()=>setTextExpanded(value=>!value)}:undefined}/></Pressable>)}
    {embeds.length>0&&<CastEmbeds embeds={embeds} visible={loadActivity} gutter={expanded?0:48}/>}
    {expanded&&<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'flex-start',columnGap:8,rowGap:2,marginTop:2}}>
      <Text style={{fontSize:12,lineHeight:18,color:colors.muted}}>{castDate(cast.data.timestamp).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</Text>
      <View style={{marginLeft:'auto',maxWidth:'100%'}}><ClientLabel fid={cast.data.fid} signer={cast.signer}/></View>
    </View>}
    <CastActions cast={cast} enabled={loadActivity} conversation={expanded}/>
    </View>
  </Container>;
});
