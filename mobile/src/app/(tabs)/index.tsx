import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {Icon,space} from '../../components/ui';

export default function Home(){
  const {api,colors}=useApp();
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  return <View style={{flex:1}}>
    <View style={[space.row,{paddingLeft:18,paddingRight:8,minHeight:56,backgroundColor:colors.surface,borderBottomWidth:1,borderColor:colors.line}]}>
      <Text style={{flex:1,fontSize:21,fontWeight:'700',letterSpacing:-.5,color:colors.ink}}>Home</Text>
      <View style={[space.row,{gap:5}]}><Icon name="clock" size={13} color={colors.muted}/><Text style={{fontSize:12,fontWeight:'500',color:colors.muted}}>Latest</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh feed" accessibilityState={{disabled:page.loading,busy:page.refreshing}} disabled={page.loading} onPress={page.refresh} style={({pressed})=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent',opacity:page.loading&&!page.refreshing?.4:1})}>
        {page.refreshing?<ActivityIndicator size="small" color={colors.accent}/>:<Icon name="refresh-cw" size={18} color={colors.muted}/>}
      </Pressable>
    </View>
    <CastList page={page} autoLoadMore/>
  </View>;
}
