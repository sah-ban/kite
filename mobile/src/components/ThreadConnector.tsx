import {View} from 'react-native';
import {useApp} from '../lib/state';

export function ThreadConnector({before=false,after=false,avatarTop=8}:{before?:boolean;after?:boolean;avatarTop?:number}){
  const {colors}=useApp();
  const line={position:'absolute' as const,left:33,width:2,borderRadius:1,backgroundColor:colors.line};
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:'absolute',inset:0}}>
    {before&&<View testID="thread-line-before" style={[line,{top:0,height:avatarTop+20}]}/>}
    {after&&<View testID="thread-line-after" style={[line,{top:avatarTop+40,bottom:-1}]}/>}
  </View>;
}
