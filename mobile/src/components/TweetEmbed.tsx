import {Image} from 'expo-image';
import {useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import {type XPost,xPostLink,xPostTime} from '../lib/x-post';
import {safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {Icon} from './ui';
import {XIcon} from './XIcon';

function TweetMedia({media}:{media:XPost['media'][number]}){
  const {colors}=useApp(),[failed,setFailed]=useState(false),image=safeLink(media.url);
  return <View accessibilityRole="image" accessibilityLabel={media.kind==='video'?'X post video preview':'X post image'} style={{width:'100%',height:'100%',borderRadius:10,overflow:'hidden',backgroundColor:colors.soft,alignItems:'center',justifyContent:'center'}}>
    {image&&!failed?<Image source={{uri:image}} onError={()=>setFailed(true)} style={{width:'100%',height:'100%'}} contentFit="cover"/>:<Icon name={media.kind==='video'?'video':'image'} size={22} color={colors.muted}/>}
    {media.kind==='video'&&image&&!failed&&<View style={{position:'absolute',width:28,height:28,borderRadius:14,backgroundColor:'#00000088',alignItems:'center',justifyContent:'center'}}><Icon name="play" size={15} color="#fff"/></View>}
  </View>;
}
export function TweetEmbed({post,height}:{post:XPost;height?:number}){
  const {colors}=useApp(),[avatarFailed,setAvatarFailed]=useState(false),[error,setError]=useState('');
  const url=xPostLink(post.url),avatar=post.avatar?safeLink(post.avatar):undefined;
  if(!url)return null;
  const media=(post.media||[]).filter(item=>safeLink(item.url)).slice(0,4),time=xPostTime(post.createdAt);
  const text=post.text?<Text numberOfLines={height&&media.length>1?3:5} ellipsizeMode="tail" style={{fontSize:16,lineHeight:21,color:colors.ink}}>{post.text}</Text>:null;
  return <Pressable accessibilityRole="link" accessibilityLabel={post.username?`Open X post by @${post.username}`:'Open post on X'} onPress={event=>{event.stopPropagation();setError('');void Linking.openURL(url).catch(()=>setError('Could not open X. Please try again.'));}} style={({pressed})=>({height,padding:10,gap:6,borderRadius:14,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,opacity:pressed?.85:1,overflow:'hidden'})}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <View style={{width:32,height:32,borderRadius:16,overflow:'hidden',backgroundColor:colors.soft,alignItems:'center',justifyContent:'center'}}>{avatar&&!avatarFailed?<Image source={{uri:avatar}} onError={()=>setAvatarFailed(true)} style={{width:32,height:32}} contentFit="cover"/>:<Icon name="user" size={20} color={colors.muted}/>}</View>
      <Text numberOfLines={1} style={{flex:1,minWidth:0,fontSize:14,fontWeight:'600',color:colors.ink}}>{post.username?`@${post.username}`:post.name||'Post on X'}</Text><XIcon size={12}/>{time&&<Text style={{fontSize:11,color:colors.muted}}>{time}</Text>}
    </View>
    {post.unavailable?<View style={{gap:6}}><Text style={{fontSize:14,lineHeight:20,color:colors.muted}}>Post preview unavailable.</Text><Text style={{fontSize:13,fontWeight:'600',color:colors.accent}}>View on X</Text></View>:media.length===1?<View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><View style={{width:76,height:76}}><TweetMedia media={media[0]}/></View><View style={{flex:1,minWidth:0}}>{text}</View></View>:<>{text}{media.length>1&&<View style={{flexDirection:'row',gap:6}}>{media.map((item,index)=><View key={`${index}:${item.url}`} style={{flex:1,minWidth:0,maxWidth:96,aspectRatio:1}}><TweetMedia media={item}/></View>)}</View>}</>}
    {!!error&&<Text accessibilityRole="alert" style={{fontSize:12,color:colors.danger}}>{error}</Text>}
  </Pressable>;
}
