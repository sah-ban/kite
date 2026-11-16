import {Image} from 'expo-image';
import {router,useLocalSearchParams} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useCallback,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {isFid,safeLink,mergeCasts} from '../../lib/model';
import {useCastPage,useQuery} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Avatar,Icon,Loading,Notice,space} from '../../components/ui';
import {openLink} from '../../components/CastCard';
import {ProfileAction} from '../../components/ProfileAction';
import {ProfileBio} from '../../components/ProfileBio';
import {ProfileFid} from '../../components/ProfileFid';

export default function ProfileScreen(){
  const params=useLocalSearchParams<{fid:string}>(),insets=useSafeAreaInsets(),{colors}=useApp();const fid=Number(params.fid);
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.background}}>
    {isFid(fid)?<Profile key={fid} fid={fid}/>:<><ProfileBackButton/><Notice title="Profile not found">This link has an invalid FID.</Notice></>}
  </View>;
}
function ProfileBackButton(){
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/')} style={({pressed})=>({position:'absolute',top:8,left:14,width:40,height:40,borderRadius:20,backgroundColor:pressed?'#00000099':'#00000066',alignItems:'center',justifyContent:'center',zIndex:10})}><Icon name="arrow-left" size={21} color="#fff"/></Pressable>;
}
function Profile({fid}:{fid:number}){
  const {api,colors,published,profileRevision}=useApp();const [tab,setTab]=useState<'posts'|'replies'>('posts');
  const [compactHeader,setCompactHeader]=useState(false),headerShown=useRef(false);
  const profile=useQuery(()=>api.profile(fid),[api,fid,profileRevision]);const counts=useQuery(signal=>api.counts(fid,signal),[api,fid]);
  const page=useCastPage((cursor,signal)=>api.profileCasts(fid,cursor,signal),[api,fid]);
  const selected={...page,items:mergeCasts(published.filter(cast=>cast.data.fid===fid),page.items).filter(cast=>!!cast.data.castAddBody.parentCastId===(tab==='replies')).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  const p=profile.value;
  const bannerHeight=p?.banner&&safeLink(p.banner)?104:72;
  const onScroll=useCallback((event:import('react-native').NativeSyntheticEvent<import('react-native').NativeScrollEvent>)=>{
    const shown=event.nativeEvent.contentOffset.y>=bannerHeight;
    if(shown!==headerShown.current){headerShown.current=shown;setCompactHeader(shown);}
  },[bannerHeight]);
  return <View style={{flex:1}}><CastList onScroll={onScroll} page={selected} empty={tab==='posts'?'No posts on this page':'No replies on this page'} header={<View>
    <View>{p?.banner&&safeLink(p.banner)?<Image source={{uri:p.banner}} contentFit="cover" style={{width:'100%',height:104}}/>:<View style={{height:72,backgroundColor:colors.accentSoft}}/>}{!compactHeader&&<ProfileBackButton/>}</View>
    <View style={{paddingHorizontal:14,paddingTop:10,paddingBottom:8,gap:6}}>{profile.loading?<Loading/>:profile.error?<Notice title="Couldn’t load profile" retry={profile.reload}>{profile.error}</Notice>:<><View style={[space.row,{justifyContent:'space-between',marginTop:-32}]}><View style={{padding:3,borderRadius:40,backgroundColor:colors.background}}><Avatar url={p?.avatar} size={64}/></View><View style={{flex:1,minWidth:0,alignItems:'flex-end',paddingTop:18,gap:0}}><ProfileAction fid={fid}/></View></View><View style={{gap:2}}><Text style={{color:colors.ink,fontSize:23,lineHeight:28,fontWeight:'700',letterSpacing:-.5}}>{p?.name}</Text><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>{!!p?.username&&<Text numberOfLines={1} style={{color:colors.muted,fontSize:13,flexShrink:1}}>@{p.username}</Text>}</View></View>{!!p?.bio&&<ProfileBio text={p.bio}/>}{!!p?.website&&safeLink(p.website)&&<Pressable accessibilityRole="link" accessibilityLabel={p.website} onPress={()=>void openLink(p.website)} hitSlop={{top:12,bottom:12,left:6,right:6}} style={{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:5,minHeight:20,marginVertical:-2,minWidth:0,maxWidth:'100%'}}><Icon name="link" size={13} color={colors.accent}/><Text numberOfLines={1} ellipsizeMode="tail" style={{color:colors.accent,fontSize:13,flexShrink:1}}>{new URL(p.website).hostname.replace(/^www\./,'')}</Text></Pressable>}<View style={{flexDirection:'row',alignItems:'center',gap:12,minWidth:0}}>
      {counts.value&&<View style={{flexDirection:'row',alignItems:'center',gap:10,flexShrink:1,minWidth:0}}><Text numberOfLines={1} style={{color:colors.ink,fontSize:13,fontWeight:'600',flexShrink:1}}>{counts.value.followingCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>following</Text></Text><Text numberOfLines={1} style={{color:colors.ink,fontSize:13,fontWeight:'600',flexShrink:1}}>{counts.value.followerCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>followers</Text></Text></View>}
      <ProfileFid fid={fid}/>
    </View></>}
    </View><View style={{flexDirection:'row',borderBottomWidth:1,borderColor:colors.line}}>{(['posts','replies'] as const).map(value=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===value}} key={value} onPress={()=>setTab(value)} style={{flex:1,minHeight:44,paddingVertical:10,paddingHorizontal:14,alignItems:'center',borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{fontWeight:'600',color:tab===value?colors.ink:colors.muted}}>{value==='posts'?'Posts':'Replies'}</Text></Pressable>)}</View>
  </View>}/>
    {compactHeader&&<View accessibilityLabel="Profile header" style={{position:'absolute',top:0,left:0,right:0,height:48,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,backgroundColor:colors.surface,borderBottomWidth:1,borderColor:colors.line,zIndex:20}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/')} style={({pressed})=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent'})}><Icon name="arrow-left" size={21}/></Pressable>
      <Avatar url={p?.avatar} size={28}/><Text numberOfLines={1} style={{flex:1,color:colors.ink,fontSize:16,fontWeight:'600'}}>{p?.username?`@${p.username}`:p?.name||`FID ${fid}`}</Text>
    </View>}
  </View>;
}
