import {HapticPressable as Pressable} from './HapticControls';
import {Animated,Text,View} from 'react-native';
import {Image} from 'expo-image';
import {useApp} from '../lib/state';
import {SCROLL_HEADER_HEIGHT} from '../lib/scroll-header';
import {AccountButton} from './AccountButton';
import {Icon} from './ui';

export function ScrollHeader({title,logo=false,hidden,headerY,testID,onTitlePress,titleAccessibilityLabel,onSearch}:{title:string;logo?:boolean;hidden:boolean;headerY:Animated.Value|number;testID:string;onTitlePress?:()=>void;titleAccessibilityLabel?:string;onSearch?:()=>void}){
  const {colors}=useApp();
  const Title=onTitlePress?Pressable:View;
  return <Animated.View testID={testID} pointerEvents={hidden?'none':'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden?'no-hide-descendants':'auto'} style={{position:'absolute',top:0,left:0,right:0,height:SCROLL_HEADER_HEIGHT,zIndex:20,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-between',transform:[{translateY:headerY}]}}>
    <AccountButton side="left"/>
    <Title {...(onTitlePress?{onPress:onTitlePress,accessibilityRole:'button' as const,accessibilityLabel:titleAccessibilityLabel||title}:{pointerEvents:'none' as const})} style={{position:'absolute',left:70,right:70,top:0,bottom:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>{logo&&<Image source={require('../../assets/kite-mark.png')} style={{width:25,height:25}} contentFit="contain"/>}<Text numberOfLines={1} style={{color:colors.ink,fontSize:22,fontWeight:'700',letterSpacing:-.6,flexShrink:1}}>{title}</Text></Title>
    {onSearch&&<Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={onSearch} style={({pressed})=>({width:44,height:44,marginRight:12,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:pressed?colors.soft:'transparent'})}><Icon name="search" size={22} color={colors.ink}/></Pressable>}
  </Animated.View>;
}
