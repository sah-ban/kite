import {feedback} from '../lib/haptics';
import {router} from 'expo-router';
import {Text} from 'react-native';
import {useApp} from '../lib/state';
import {useCastClient} from '../lib/use-cast-client';

export function ClientLabel({fid,signer}:{fid:number;signer:string}){
  const {colors}=useApp();
  const client=useCastClient(fid,signer);
  return <Text style={{fontSize:12,lineHeight:18,color:colors.muted,textAlign:'right'}}>{client.value?<>Casted from <Text accessibilityRole="link" accessibilityLabel={`View client ${client.value.username?'@'+client.value.username:'FID '+client.value.fid}`} onPress={event=>{event.stopPropagation();feedback('selection');router.push(`/profile/${client.value!.fid}`);}} style={{textDecorationLine:'underline',color:colors.muted}}>{client.value.username?`@${client.value.username}`:`Client FID ${client.value.fid}`}</Text></>:client.loading?'Resolving client…':'Unknown client'}</Text>;
}
