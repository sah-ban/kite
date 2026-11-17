import {useRef} from 'react';
import {FlatList,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Tabs} from 'expo-router';
import {type Cast,mergeCasts} from '../../lib/model';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {ScrollHeader} from '../../components/ScrollHeader';
import {useScrollHeader} from '../../lib/use-scroll-header';
import {SCROLL_HEADER_HEIGHT} from '../../lib/scroll-header';

export default function Home(){
  const {api,colors,published}=useApp();
  const insets=useSafeAreaInsets(),motion=useScrollHeader();
  const list=useRef<FlatList<Cast>>(null);
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  function tapTitle(){
    if(!motion.isAtTop())list.current?.scrollToOffset({offset:0,animated:true});
    else if(!page.loading)page.refresh();
  }
  const feed={...page,items:mergeCasts(published.filter(cast=>!cast.data.castAddBody.parentCastId),page.items).sort((a,b)=>b.data.timestamp-a.data.timestamp)};
  return <View style={{flex:1,paddingTop:insets.top,backgroundColor:colors.surface}}>
    <Tabs.Screen options={{headerShown:false}}/>
    <View style={{flex:1,overflow:'hidden'}}>
    <CastList listRef={list} page={feed} autoLoadMore onScroll={motion.onScroll} contentTopInset={SCROLL_HEADER_HEIGHT}/>
    <ScrollHeader title="Kite" logo onTitlePress={tapTitle} titleAccessibilityLabel="Kite: scroll to top or refresh feed" hidden={motion.hidden} headerY={motion.headerY} refreshing={page.refreshing} disabled={page.loading} onRefresh={page.refresh} refreshLabel="Refresh feed" testID="home-header"/>
    </View>
  </View>;
}
