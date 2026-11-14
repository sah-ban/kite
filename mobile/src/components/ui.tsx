import {Feather} from '@expo/vector-icons';
import {Image} from 'expo-image';
import {useState,type ComponentProps,type ReactNode} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View,type TextInputProps} from 'react-native';
import {useApp} from '../lib/state';
import {safeLink} from '../lib/model';

export const space=StyleSheet.create({page:{flex:1},content:{padding:20,gap:18},row:{flexDirection:'row',alignItems:'center',gap:10},grow:{flex:1,minWidth:0},title:{fontSize:28,fontWeight:'700',letterSpacing:-.8},heading:{fontSize:19,fontWeight:'700'},body:{fontSize:16,lineHeight:23},small:{fontSize:13,lineHeight:19}});
export function Icon({name,size=20,color}:{name:ComponentProps<typeof Feather>['name'];size?:number;color?:ComponentProps<typeof Feather>['color']}){const {colors}=useApp();return <Feather name={name} size={size} color={color||colors.ink}/>;}
export function Button({label,onPress,icon,quiet=false,disabled=false}:{label:string;onPress:()=>void;icon?:ComponentProps<typeof Feather>['name'];quiet?:boolean;disabled?:boolean}){
  const {colors}=useApp();return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:46,paddingHorizontal:16,paddingVertical:11,borderRadius:14,backgroundColor:quiet?colors.soft:colors.accent,opacity:disabled?.45:pressed?.75:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8})}>{icon&&<Icon name={icon} size={17} color={quiet?colors.ink:colors.background}/>}<Text style={{color:quiet?colors.ink:colors.background,fontSize:14,fontWeight:'600'}}>{label}</Text></Pressable>;
}
export function Notice({title,children,icon='wind',retry}:{title:string;children?:ReactNode;icon?:ComponentProps<typeof Feather>['name'];retry?:()=>void}){
  const {colors}=useApp();return <View style={{padding:28,gap:12,alignItems:'center'}}><View style={{padding:16,borderRadius:22,backgroundColor:colors.accentSoft}}><Icon name={icon} size={26} color={colors.accent}/></View><Text style={[space.heading,{color:colors.ink,textAlign:'center'}]}>{title}</Text>{children&&<Text style={[space.body,{color:colors.muted,textAlign:'center'}]}>{children}</Text>}{retry&&<Button label="Try again" onPress={retry} quiet/>}</View>;
}
export function Loading(){const {colors}=useApp();return <ActivityIndicator accessibilityLabel="Loading" size="small" color={colors.accent} style={{padding:28}}/>;}
export function Field(props:TextInputProps){const {colors}=useApp();return <TextInput {...props} placeholderTextColor={colors.muted} style={[{minHeight:50,borderRadius:14,borderWidth:1,borderColor:colors.line,paddingHorizontal:14,color:colors.ink,backgroundColor:colors.surface,fontSize:16},props.style]}/>;}
export function Avatar({url,size=40}:{url?:string;size?:number}){const {colors}=useApp();const [failed,setFailed]=useState(false);return <Image source={!failed&&url&&safeLink(url)?{uri:url}:require('../../assets/kite-mark.png')} onError={()=>setFailed(true)} contentFit="contain" style={{width:size,height:size,borderRadius:size/2,backgroundColor:colors.soft}} accessibilityIgnoresInvertColors/>;}
