import {useCallback,useState,type ReactElement} from 'react';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import type {Cast} from '../lib/model';
import {useApp} from '../lib/state';
import type {useCastPage} from '../lib/hooks';
import {CastCard} from './CastCard';
import {Button,Icon,Loading,Notice,space} from './ui';

function FeedSkeleton(){
  const {colors}=useApp();
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading casts" accessibilityState={{busy:true}}>
    {[0,1,2,3].map(index=><View key={index} importantForAccessibility="no-hide-descendants" style={{padding:18,gap:10,flexDirection:'row',borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
      <View style={{width:40,height:40,borderRadius:20,backgroundColor:colors.soft}}/>
      <View style={{flex:1,gap:12}}><View style={{gap:7,minHeight:40,justifyContent:'center'}}><View style={{height:12,width:118,borderRadius:5,backgroundColor:colors.soft}}/><View style={{height:10,width:80,borderRadius:5,backgroundColor:colors.soft}}/></View>
      {[100,index%2?94:87,62].map((width,line)=><View key={line} style={{height:11,width:`${width}%`,borderRadius:5,backgroundColor:colors.soft}}/>)}
      </View>
    </View>)}
  </View>;
}

export function CastList({page,header,empty='No casts yet',autoLoadMore=false}:{page:ReturnType<typeof useCastPage>;header?:ReactElement;empty?:string;autoLoadMore?:boolean}){
  const {colors}=useApp();
  const [visible,setVisible]=useState<Set<string>>(()=>new Set());
  const onViewableItemsChanged=useCallback(({viewableItems}:{viewableItems:{isViewable:boolean;item:Cast}[]})=>setVisible(new Set(viewableItems.filter(item=>item.isViewable).map(({item})=>`${item.data.fid}:${item.hash}`))),[]);
  return <FlatList style={{flex:1,backgroundColor:colors.background}} data={page.items} extraData={visible} onViewableItemsChanged={onViewableItemsChanged} keyExtractor={cast=>`${cast.data.fid}:${cast.hash}`} renderItem={({item})=><CastCard cast={item} loadActivity={visible.has(`${item.data.fid}:${item.hash}`)}/>} ListHeaderComponent={<View>{header}{!!page.error&&page.items.length>0&&<View accessibilityRole="alert" style={[space.row,{padding:16,backgroundColor:colors.accentSoft}]}><Icon name="wifi-off" size={18} color={colors.muted}/><Text style={{flex:1,color:colors.ink,fontSize:13,lineHeight:19}}>Couldn’t update the feed. Your loaded casts are still here.</Text><Button label="Retry" quiet onPress={page.retry}/></View>}</View>} keyboardShouldPersistTaps="handled" initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} onEndReached={autoLoadMore&&!page.error?page.more:undefined} onEndReachedThreshold={.4} refreshControl={<RefreshControl refreshing={page.refreshing} onRefresh={page.refresh} tintColor={colors.accent} colors={[colors.accent]}/>}
    ListEmptyComponent={page.loading?<FeedSkeleton/>:!page.error?<Notice title={empty} icon="message-circle">Pull down to refresh.</Notice>:undefined}
    ListFooterComponent={<View style={{paddingBottom:24}}>{!!page.error&&page.items.length===0&&<Notice title="Couldn’t load casts" retry={page.retry}>{page.error}</Notice>}{page.loading?(page.items.length>0&&!page.refreshing?<Loading/>:null):page.next?<View style={{padding:18}}><Button label="Load more" quiet onPress={page.more}/></View>:page.items.length>0?<Text style={{color:colors.muted,textAlign:'center',padding:24,fontSize:12}}>You’re all caught up</Text>:null}</View>}
  />;
}
