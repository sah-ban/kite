import {Image} from 'expo-image';
import {Pressable,Text,View} from 'react-native';
import {type Draft,draftLinks,removeLink} from '../lib/composer';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {safeLink} from '../lib/model';
import {Icon,space} from './ui';
import {Quote} from './CastCard';

function LinkPreview({url}:{url:string}){
  const {api,colors}=useApp(),normalized=safeLink(url),{value}=useQuery(signal=>normalized?api.embed(normalized,signal):Promise.resolve(undefined),[api,normalized]);
  const source=value?.kind==='image'?value.url:value?.image,image=source?safeLink(source):undefined;
  return <View style={{gap:6}}>{!!image&&<Image source={{uri:image}} style={{height:120,width:'100%',borderRadius:10}} contentFit="cover"/>}<Text numberOfLines={2} style={{color:colors.ink,fontSize:14,fontWeight:'500'}}>{value?.title||url}</Text><Text style={{color:colors.muted,fontSize:12}}>{normalized?new URL(normalized).hostname:'Embedded link'}</Text></View>;
}
export function ComposeAttachments({draft,update,disabled}:{draft:Draft;update:(change:(draft:Draft)=>Draft)=>void;disabled:boolean}){
  const {colors}=useApp();const links=draftLinks(draft);
  return <View style={{gap:10}}>
    {(draft.originalEmbeds||[]).map((embed,index)=><View key={`original:${index}:${embed.url||embed.castId?.hash}`} style={{borderWidth:1,borderColor:colors.line,borderRadius:14,padding:10,gap:6}}><View style={space.row}><Text style={{flex:1,color:colors.muted,fontSize:12}}>{embed.castId?'Quoted cast':`Embed ${index+1}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove original embed ${index+1}`} disabled={disabled} onPress={()=>update(value=>{const next={...value,originalEmbeds:value.originalEmbeds?.filter((_,i)=>i!==index)};return embed.url?removeLink(next,embed.url):next;})} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={17}/></Pressable></View>{embed.castId?<Quote {...embed.castId}/>:embed.url?<LinkPreview url={embed.url}/>:null}</View>)}
    {draft.images.length>0&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{draft.images.map((url,index)=><View key={`${index}:${url}`} style={{width:draft.images.length===1?'100%':'48%',height:160,borderRadius:14,overflow:'hidden',backgroundColor:colors.soft}}><Image source={{uri:url}} style={{width:'100%',height:'100%'}} contentFit="cover"/><Pressable accessibilityRole="button" accessibilityLabel={`Remove image ${index+1}`} disabled={disabled} onPress={()=>update(value=>({...value,images:value.images.filter((_,i)=>i!==index)}))} style={{position:'absolute',right:4,top:4,width:36,height:36,borderRadius:18,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={17}/></Pressable></View>)}</View>}
    {links.urls.map(url=><View key={url} style={{borderWidth:1,borderColor:colors.line,borderRadius:14,padding:12,gap:6}}><View style={space.row}><Text style={{flex:1,color:colors.muted,fontSize:12}}>Link embed</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove link embed ${url}`} disabled={disabled} onPress={()=>update(value=>removeLink(value,url))} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={17}/></Pressable></View><LinkPreview url={url}/></View>)}
    {draft.quote&&<View style={{gap:6}}><View style={space.row}><Text style={{flex:1,color:colors.muted,fontSize:12}}>Quoted cast</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove quoted cast" disabled={disabled} onPress={()=>update(value=>({...value,quote:undefined}))} style={{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'}}><Icon name="x" size={17}/></Pressable></View><Quote {...draft.quote}/></View>}
    {links.overflow>0&&<Text style={{color:colors.muted,fontSize:12}}>Embed slots are full. Additional links stay as text.</Text>}
  </View>;
}
