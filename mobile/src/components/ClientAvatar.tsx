import {Image} from 'expo-image';
import type {CastClient,ClientLogo} from '../lib/cast-clients';
import {useApp} from '../lib/state';
import {Avatar} from './ui';

const logos:Record<ClientLogo,number>={
  warpcast:require('../../assets/clients/warpcast.png'),
  firefly:require('../../assets/clients/firefly.png'),
  kite:require('../../assets/kite-mark.png'),
};
export function ClientAvatar({client,size=22}:{client:CastClient;size?:number}){
  const {colors}=useApp();
  return client.logo?<Image source={logos[client.logo]} contentFit="contain" style={{width:size,height:size,borderRadius:size/2,backgroundColor:colors.soft}} accessibilityIgnoresInvertColors/>:<Avatar url={client.avatar} size={size}/>;
}
