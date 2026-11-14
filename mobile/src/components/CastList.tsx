import type {ReactElement} from 'react';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import type {useCastPage} from '../lib/hooks';
import {CastCard} from './CastCard';
import {Button,Loading,Notice} from './ui';

export function CastList({page,header,empty='No casts yet'}:{page:ReturnType<typeof useCastPage>;header?:ReactElement;empty?:string}){
  const {colors}=useApp();
  return <FlatList style={{flex:1,backgroundColor:colors.background}} data={page.items} keyExtractor={cast=>`${cast.data.fid}:${cast.hash}`} renderItem={({item})=><CastCard cast={item}/>} ListHeaderComponent={header} keyboardShouldPersistTaps="handled" initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} refreshControl={<RefreshControl refreshing={page.refreshing} onRefresh={page.refresh} tintColor={colors.accent} colors={[colors.accent]}/>}
    ListEmptyComponent={page.loading?<Loading/>:!page.error?<Notice title={empty} icon="message-circle">Pull down to refresh.</Notice>:undefined}
    ListFooterComponent={<View style={{paddingBottom:24}}>{page.error&&<Notice title="Couldn’t load casts" retry={page.retry}>{page.error}</Notice>}{page.loading?(page.items.length>0?<Loading/>:null):page.next?<View style={{padding:18}}><Button label="Load more" quiet onPress={page.more}/></View>:page.items.length>0?<Text style={{color:colors.muted,textAlign:'center',padding:24,fontSize:12}}>You’re all caught up</Text>:null}</View>}
  />;
}
