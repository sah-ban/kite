import {Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import type {Cast,Page} from '../lib/model';
import {CastText} from './CastCard';

const count=(page:Page<unknown>|null|undefined)=>page?`${page.items.length}${page.next?'+':''}`:'—';
export function EditCastSummary({cast,frozen,deleted}:{cast:Cast;frozen:boolean;deleted:boolean}){
  const {api,colors}=useApp(),activity=useQuery(()=>api.activity(cast),[api,cast.data.fid,cast.hash]);
  return <View style={{padding:12,gap:8,borderRadius:14,backgroundColor:colors.soft}}>
    <Text style={{fontSize:13,fontWeight:'700',color:colors.ink}}>Previous cast</Text>
    <CastText cast={cast} limit={200} compact/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[`${count(activity.value?.likes)} likes`,`${count(activity.value?.recasts)} recasts`,`${count(activity.value?.replies)} replies`].map(label=><Text key={label} style={{fontSize:12,color:colors.muted}}>{label}</Text>)}</View>
    <Text style={{fontSize:13,lineHeight:19,color:colors.muted}}>{deleted?'The previous cast was deleted. Your replacement is saved; retry to finish publishing it.':frozen?'The replacement is prepared and saved. Retry to finish this edit.':'This deletes the previous cast and publishes a new one. Likes, recasts, and replies do not transfer.'}</Text>
  </View>;
}
