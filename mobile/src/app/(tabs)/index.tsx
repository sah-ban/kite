import {ActivityIndicator,Pressable,View} from 'react-native';
import {router,Tabs} from 'expo-router';
import {mergeCasts} from '../../lib/model';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Icon} from '../../components/ui';
import {AccountButton} from '../../components/AccountButton';

export default function Home(){
  const {api,colors,published,account}=useApp();
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  const feed={...page,items:mergeCasts(published.filter(cast=>!cast.data.castAddBody.parentCastId),page.items).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  return <View style={{flex:1}}>
    <Tabs.Screen options={{headerTitleAlign:'center',headerLeft:()=> <AccountButton side="left"/>,headerRight:()=> <Pressable accessibilityRole="button" accessibilityLabel="Refresh feed" accessibilityState={{disabled:page.loading,busy:page.refreshing}} disabled={page.loading} onPress={page.refresh} style={({pressed})=>({width:44,height:44,marginRight:12,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent',opacity:page.loading&&!page.refreshing?.4:1})}>
        {page.refreshing?<ActivityIndicator size="small" color={colors.accent}/>:<Icon name="refresh-cw" size={18} color={colors.muted}/>}
      </Pressable>}}/>
    <CastList page={feed} autoLoadMore/>
    <Pressable accessibilityRole="button" accessibilityLabel="New cast" onPress={()=>router.push(account.session?'/compose':'/sign-in')} style={({pressed})=>({position:'absolute',right:18,bottom:24,width:56,height:56,borderRadius:19,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',elevation:4,opacity:pressed?.8:1})}><Icon name="edit-3" size={24} color={colors.background}/></Pressable>
  </View>;
}
