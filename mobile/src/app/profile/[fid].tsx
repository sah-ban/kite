import {Image} from 'expo-image';
import {useLocalSearchParams} from 'expo-router';
import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {isFid,safeLink,mergeCasts} from '../../lib/model';
import {useCastPage,useQuery} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Avatar,Button,Loading,Notice,space} from '../../components/ui';
import {openLink} from '../../components/CastCard';

export default function ProfileScreen(){
  const params=useLocalSearchParams<{fid:string}>();const fid=Number(params.fid);if(!isFid(fid))return <Notice title="Profile not found">This link has an invalid FID.</Notice>;
  return <Profile fid={fid}/>;
}
function Profile({fid}:{fid:number}){
  const {api,colors,published}=useApp();const [tab,setTab]=useState<'posts'|'replies'>('posts');
  const profile=useQuery(()=>api.profile(fid),[api,fid]);const counts=useQuery(signal=>api.counts(fid,signal),[api,fid]);
  const page=useCastPage((cursor,signal)=>api.profileCasts(fid,cursor,signal),[api,fid]);
  const selected={...page,items:mergeCasts(published.filter(cast=>cast.data.fid===fid),page.items).filter(cast=>!!cast.data.castAddBody.parentCastId===(tab==='replies')).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  const p=profile.value;
  return <CastList page={selected} empty={tab==='posts'?'No posts on this page':'No replies on this page'} header={<View>
    {p?.banner&&safeLink(p.banner)?<Image source={{uri:p.banner}} contentFit="cover" style={{width:'100%',height:120}}/>:<View style={{height:80,backgroundColor:colors.accentSoft}}/>}
    <View style={{padding:20,gap:10}}>{profile.loading?<Loading/>:profile.error?<Notice title="Couldn’t load profile" retry={profile.reload}>{profile.error}</Notice>:<><View style={[space.row,{justifyContent:'space-between',marginTop:-42}]}><View style={{padding:4,borderRadius:50,backgroundColor:colors.background}}><Avatar url={p?.avatar} size={72}/></View><Text style={{color:colors.muted,fontSize:12,marginTop:30}}>FID {fid}</Text></View><Text style={[space.title,{color:colors.ink}]}>{p?.name}</Text>{!!p?.username&&<Text style={{color:colors.muted,fontSize:15}}>@{p.username}</Text>}{!!p?.bio&&<Text selectable style={[space.body,{color:colors.ink}]}>{p.bio}</Text>}{counts.value&&<View style={[space.row,{flexWrap:'wrap'}]}><Text style={{color:colors.ink,fontSize:14,fontWeight:'600'}}>{counts.value.followerCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>followers</Text></Text><Text style={{color:colors.ink,fontSize:14,fontWeight:'600'}}>{counts.value.followingCount?.toLocaleString()??'—'} <Text style={{color:colors.muted,fontWeight:'400'}}>following</Text></Text></View>}{p?.website&&safeLink(p.website)&&<Button label={new URL(p.website).hostname} quiet icon="link" onPress={()=>void openLink(p.website)}/>}</>}
    </View><View style={{flexDirection:'row',borderBottomWidth:1,borderColor:colors.line}}>{(['posts','replies'] as const).map(value=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===value}} key={value} onPress={()=>setTab(value)} style={{flex:1,padding:15,alignItems:'center',borderBottomWidth:2,borderBottomColor:tab===value?colors.accent:'transparent'}}><Text style={{fontWeight:'600',color:tab===value?colors.ink:colors.muted}}>{value==='posts'?'Posts':'Replies'}</Text></Pressable>)}</View>
  </View>}/>;
}
