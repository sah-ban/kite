import {type ComponentProps,type ReactNode} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useApp} from '../lib/state';
import {Icon} from './ui';

export function SettingsSection({title,children}:{title:string;children:ReactNode}){
  const {colors}=useApp();
  return <View style={{gap:8}}><Text accessibilityRole="header" style={{paddingLeft:4,fontSize:12,fontWeight:'600',letterSpacing:.7,color:colors.muted}}>{title.toUpperCase()}</Text><View style={{borderWidth:1,borderColor:colors.line,borderRadius:16,backgroundColor:colors.surface,overflow:'hidden'}}>{children}</View></View>;
}
export function SettingsRow({icon,title,description,control,onPress}:{icon:ComponentProps<typeof Icon>['name'];title:string;description:string;control?:ReactNode;onPress?:()=>void}){
  const {colors}=useApp();
  const content=<><View style={{width:36,height:36,borderRadius:11,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={18} color={colors.accent}/></View><View style={{flex:1,minWidth:0,gap:3}}><Text style={{fontSize:15,lineHeight:21,fontWeight:'600',color:colors.ink}}>{title}</Text><Text style={{fontSize:13,lineHeight:18,color:colors.muted}}>{description}</Text></View>{control||(onPress&&<Icon name="chevron-right" size={18} color={colors.muted}/>)}</>;
  const style={minHeight:80,padding:14,flexDirection:'row' as const,alignItems:'center' as const,gap:12};
  return onPress?<Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description} onPress={onPress} style={({pressed})=>[style,{backgroundColor:pressed?colors.soft:colors.surface}]}>{content}</Pressable>:<View style={style}>{content}</View>;
}
