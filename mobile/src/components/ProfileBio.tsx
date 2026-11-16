import {Linking,Text} from 'react-native';
import {useApp} from '../lib/state';
import {textLinkParts} from '../lib/text-links';
import {space} from './ui';

export function ProfileBio({text}:{text:string}){
  const {colors}=useApp();
  return <Text selectable style={[space.body,{color:colors.ink,fontSize:15,lineHeight:21}]}>{textLinkParts(text).map((part,index)=>part.url?<Text key={index} accessibilityRole="link" accessibilityLabel={part.text} style={{color:colors.accent,textDecorationLine:'underline'}} onPress={event=>{event.stopPropagation();void Linking.openURL(part.url!).catch(()=>{});}}>{part.text}</Text>:part.text)}</Text>;
}
