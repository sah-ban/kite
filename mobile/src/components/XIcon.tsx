import Svg,{Path} from 'react-native-svg';
import {useApp} from '../lib/state';

export function XIcon(){
  const {colors}=useApp();
  return <Svg width={20} height={20} viewBox="0 0 24 24"><Path fill={colors.ink} d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"/></Svg>;
}
