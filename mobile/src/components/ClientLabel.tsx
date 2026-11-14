import {router} from 'expo-router';
import {Text} from 'react-native';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';

export function ClientLabel({fid,signer}:{fid:number;signer:string}){
  const {api,colors}=useApp();
  const client=useQuery(async()=>{
    const requester=await api.signerRequester(fid,signer);if(!requester)return;
    const account=await api.profile(requester).catch(()=>undefined);
    return {fid:requester,username:account?.username};
  },[api,fid,signer]);
  return <Text style={{fontSize:12,lineHeight:18,color:colors.muted,textAlign:'right'}}>{client.value?<>Casted from <Text accessibilityRole="link" accessibilityLabel={`View client ${client.value.username?'@'+client.value.username:'FID '+client.value.fid}`} onPress={event=>{event.stopPropagation();router.push(`/profile/${client.value!.fid}`);}} style={{textDecorationLine:'underline',color:colors.muted}}>{client.value.username?`@${client.value.username}`:`Client FID ${client.value.fid}`}</Text></>:client.loading?'Resolving client…':'Unknown client'}</Text>;
}
