import {Pressable,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {router,Tabs} from 'expo-router';
import {mergeCasts} from '../../lib/model';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Icon} from '../../components/ui';
import {ScrollHeader} from '../../components/ScrollHeader';
import {useScrollHeader} from '../../lib/use-scroll-header';
import {SCROLL_HEADER_HEIGHT} from '../../lib/scroll-header';

export default function Home(){
  const {api,colors,published,account}=useApp();
  const insets=useSafeAreaInsets(),motion=useScrollHeader();
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  const feed={...page,items:mergeCasts(published.filter(cast=>!cast.data.castAddBody.parentCastId),page.items).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.surface}}>
    <Tabs.Screen options={{headerShown:false}}/>
    <View style={{flex:1,overflow:'hidden'}}>
    <CastList page={feed} autoLoadMore onScroll={motion.onScroll} contentTopInset={SCROLL_HEADER_HEIGHT}/>
    <ScrollHeader title="Kite" logo hidden={motion.hidden} headerY={motion.headerY} refreshing={page.refreshing} disabled={page.loading} onRefresh={page.refresh} refreshLabel="Refresh feed" testID="home-header"/>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="New cast" onPress={()=>router.push(account.session?'/compose':'/sign-in')} style={({pressed})=>({position:'absolute',right:18,bottom:24,width:56,height:56,borderRadius:19,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center',elevation:4,opacity:pressed?.8:1})}><Icon name="edit-3" size={24} color={colors.background}/></Pressable>
  </View>;
}
