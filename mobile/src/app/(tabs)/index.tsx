import {Text,View} from 'react-native';
import {useApp} from '../../lib/state';
import {useCastPage} from '../../lib/hooks';
import {CastList} from '../../components/CastList';
import {space} from '../../components/ui';

export default function Home(){
  const {api,colors}=useApp();
  const page=useCastPage((cursor,signal)=>api.publicFeed(cursor,signal),[api]);
  return <CastList page={page} header={<View style={{padding:20,gap:6}}><Text style={[space.title,{color:colors.ink}]}>A window into Farcaster.</Text><Text style={[space.small,{color:colors.muted}]}>Recent posts from Kite’s public index, in chronological order.</Text><View style={{flexDirection:'row',marginTop:8}}><View style={{backgroundColor:colors.accentSoft,paddingHorizontal:12,paddingVertical:6,borderRadius:20}}><Text style={{fontSize:12,color:colors.accent,fontWeight:'600'}}>PUBLIC FEED</Text></View></View></View>}/>;
}
