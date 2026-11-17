import {useCallback,useRef,useState,type ReactElement} from 'react';
import {FlatList,RefreshControl,Text,View,useWindowDimensions,type NativeSyntheticEvent,type NativeScrollEvent} from 'react-native';
import type {Cast} from '../lib/model';
import {useApp} from '../lib/state';
import type {useCastPage} from '../lib/hooks';
import {CastCard} from './CastCard';
import {Button,Icon,Loading,Notice,space} from './ui';
import {usePrependAnchor} from '../lib/use-prepend-anchor';

const SKELETON_ROW_HEIGHT=144;
function FeedSkeleton({height}:{height:number}){
  const {colors}=useApp(),window=useWindowDimensions();
  const rows=Math.max(1,Math.ceil((height||window.height)/SKELETON_ROW_HEIGHT));
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading casts" accessibilityState={{busy:true}}>
    {Array.from({length:rows},(_,index)=><View key={index} importantForAccessibility="no-hide-descendants" style={{height:SKELETON_ROW_HEIGHT,paddingHorizontal:14,paddingVertical:8,gap:8,flexDirection:'row',borderBottomWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
      <View style={{width:40,height:40,borderRadius:20,backgroundColor:colors.soft}}/>
      <View style={{flex:1,gap:8}}><View style={{gap:4,minHeight:40,justifyContent:'center'}}><View style={{height:12,width:118,borderRadius:5,backgroundColor:colors.soft}}/><View style={{height:10,width:80,borderRadius:5,backgroundColor:colors.soft}}/></View>
      {[100,index%2?94:87,62].map((width,line)=><View key={line} style={{height:11,width:`${width}%`,borderRadius:5,backgroundColor:colors.soft}}/>)}
      <View style={{flexDirection:'row',gap:26,marginTop:4}}>{[0,1,2,3].map(action=><View key={action} style={{width:22,height:10,borderRadius:5,backgroundColor:colors.soft}}/>)}</View>
      </View>
    </View>)}
  </View>;
}

export function CastList({page,header,beforeHeader,onNearTop,empty='No casts yet',autoLoadMore=false,onScroll,contentTopInset=0}:{page:ReturnType<typeof useCastPage>;header?:ReactElement;beforeHeader?:ReactElement;onNearTop?:()=>void;empty?:string;autoLoadMore?:boolean;onScroll?:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;contentTopInset?:number}){
  const {colors}=useApp();
  const list=useRef<FlatList<Cast>>(null),anchor=usePrependAnchor(offset=>list.current?.scrollToOffset({offset,animated:false}),onNearTop);
  const [viewportHeight,setViewportHeight]=useState(0);
  const [visible,setVisible]=useState<Set<string>>(()=>new Set());
  const onViewableItemsChanged=useCallback(({viewableItems}:{viewableItems:{isViewable:boolean;item:Cast}[]})=>setVisible(new Set(viewableItems.filter(item=>item.isViewable).map(({item})=>`${item.data.fid}:${item.hash}`))),[]);
  return <FlatList ref={list} onLayout={event=>setViewportHeight(event.nativeEvent.layout.height)} style={{flex:1,backgroundColor:colors.background}} contentContainerStyle={contentTopInset?{paddingTop:contentTopInset}:undefined} onScroll={beforeHeader?event=>{anchor.onScroll(event);onScroll?.(event);}:onScroll} scrollEventThrottle={onScroll||beforeHeader?32:undefined} data={page.items} extraData={visible} onViewableItemsChanged={onViewableItemsChanged} keyExtractor={cast=>`${cast.data.fid}:${cast.hash}`} renderItem={({item})=><CastCard cast={item} loadActivity={visible.has(`${item.data.fid}:${item.hash}`)}/>} ListHeaderComponent={<View>{beforeHeader&&<View onLayout={anchor.onLayout}>{beforeHeader}</View>}{header}{!!page.error&&page.items.length>0&&<View accessibilityRole="alert" style={[space.row,{padding:16,backgroundColor:colors.accentSoft}]}><Icon name="wifi-off" size={18} color={colors.muted}/><Text style={{flex:1,color:colors.ink,fontSize:13,lineHeight:19}}>Couldn’t update the feed. Your loaded casts are still here.</Text><Button label="Retry" quiet onPress={page.retry}/></View>}</View>} keyboardShouldPersistTaps="handled" initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} onEndReached={autoLoadMore&&!page.error?page.more:undefined} onEndReachedThreshold={.4} refreshControl={<RefreshControl progressViewOffset={contentTopInset||undefined} refreshing={page.refreshing} onRefresh={page.refresh} tintColor={colors.accent} colors={[colors.accent]}/>}
    ListEmptyComponent={page.loading?<FeedSkeleton height={Math.max(0,viewportHeight-contentTopInset)}/>:!page.error?<Notice title={empty} icon="message-circle">Pull down to refresh.</Notice>:undefined}
    ListFooterComponent={<View style={{paddingBottom:24}}>{!!page.error&&page.items.length===0&&<Notice title="Couldn’t load casts" retry={page.retry}>{page.error}</Notice>}{page.loading?(page.items.length>0&&!page.refreshing?<Loading/>:null):page.next?<View style={{padding:18}}><Button label="Load more" quiet onPress={page.more}/></View>:page.items.length>0?<Text style={{color:colors.muted,textAlign:'center',padding:24,fontSize:12}}>You’re all caught up</Text>:null}</View>}
  />;
}
