import {Image} from 'expo-image';
import {useLocalSearchParams} from 'expo-router';
import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {isFid,safeLink,mergeCasts} from '../../lib/model';
import {useCastPage,useQuery} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Avatar,Icon,Loading,Notice,space} from '../../components/ui';
import {openLink} from '../../components/CastCard';
import {ProfileAction} from '../../components/ProfileAction';

export default function ProfileScreen(){
  const params=useLocalSearchParams<{fid:string}>();const fid=Number(params.fid);if(!isFid(fid))return <Notice title="Profile not found">This link has an invalid FID.</Notice>;
  return <Profile key={fid} fid={fid}/>;
}
function Profile({fid}:{fid:number}){
  const {api,colors,published,profileRevision}=useApp();const [tab,setTab]=useState<'posts'|'replies'>('posts');
  const profile=useQuery(()=>api.profile(fid),[api,fid,profileRevision]);const counts=useQuery(signal=>api.counts(fid,signal),[api,fid]);
  const page=useCastPage((cursor,signal)=>api.profileCasts(fid,cursor,signal),[api,fid]);
  const selected={...page,items:mergeCasts(published.filter(cast=>cast.data.fid===fid),page.items).filter(cast=>!!cast.data.castAddBody.parentCastId===(tab==='replies')).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  const p=profile.value;
  return <CastList page={selected} empty={tab==='posts'?'No posts on this page':'No replies on this page'} header={<View>
    {p?.banner&&safeLink(p.banner)?<Image source={{uri:p.banner}} contentFit="cover" style={{width:'100%',height:120}}/>:<View style={{height:80,backgroundColor:colors.accentSoft}}/>}
    <View style={{padding:20,gap:10}}>{profile.loading?<Loading/>:profile.error?<Notice title="Couldn’t load profile" retry={profile.reload}>{profile.error}</Notice>:<><View style={[space.row,{justifyContent:'space-between',marginTop:-42}]}><View style={{padding:4,borderRadius:50,backgroundColor:colors.background}}><Avatar url={p?.avatar} size={72}/></View><View style={{flex:1,minWidth:0,alignItems:'flex-end',paddingTop:30,gap:6}}><ProfileAction fid={fid}/><Text style={{color:colors.muted,fontSize:12}}>FID {fid}</Text></View></View><Text style={[space.title,{color:colors.ink}]}>{p?.name}</Text>{!!p?.username&&<Text style={{color:colors.muted,fontSize:15}}>@{p.username}</Text>}{!!p?.bio&&<Text selectable style={[space.body,{color:colors.ink}]}>{p.bio}</Text>}<View style={{flexDirection:'row',alignItems:'center',gap:12,minWidth:0}}>
      {counts.value&&<View style={{flexDirection:'row',alignItems:'center',gap:10,flexShrink:1,minWidth:0}}><Text numberOfLines={1} style={{color:colors.ink,fontSize:13,fontWeight:'600',flexShrink:1}}>{counts.value.followingCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>following</Text></Text><Text numberOfLines={1} style={{color:colors.ink,fontSize:13,fontWeight:'600',flexShrink:1}}>{counts.value.followerCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>followers</Text></Text></View>}
      {p?.website&&safeLink(p.website)&&<Pressable accessibilityRole="link" accessibilityLabel={p.website} onPress={()=>void openLink(p.website)} style={{marginLeft:'auto',flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:4,minHeight:44,minWidth:0,maxWidth:140,flexShrink:1}}><Icon name="link" size={13} color={colors.accent}/><Text numberOfLines={1} ellipsizeMode="tail" style={{color:colors.accent,fontSize:13,flexShrink:1}}>{new URL(p.website).hostname.replace(/^www\./,'')}</Text></Pressable>}
    </View></>}
    </View><View style={{flexDirection:'row',borderBottomWidth:1,borderColor:colors.line}}>{(['posts','replies'] as const).map(value=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===value}} key={value} onPress={()=>setTab(value)} style={{flex:1,padding:15,alignItems:'center',borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{fontWeight:'600',color:tab===value?colors.ink:colors.muted}}>{value==='posts'?'Posts':'Replies'}</Text></Pressable>)}</View>
  </View>}/>;
}
