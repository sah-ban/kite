import {forwardRef,type ComponentRef} from 'react';
import {Pressable as NativePressable,Switch as NativeSwitch,type PressableProps,type SwitchProps} from 'react-native';
import {feedback,type HapticKind} from '../lib/haptics';

type TouchFeedback={haptic?:HapticKind|false};
export const HapticPressable=forwardRef<ComponentRef<typeof NativePressable>,PressableProps&TouchFeedback>(function HapticPressable({onPress,onLongPress,disabled,haptic='selection',...props},ref){
  return <NativePressable {...props} ref={ref} disabled={disabled} onPress={onPress?event=>{if(!disabled&&haptic)feedback(haptic);onPress(event);}:undefined} onLongPress={onLongPress?event=>{if(!disabled&&haptic)feedback('light');onLongPress(event);}:undefined}/>;
});
export const HapticSwitch=forwardRef<ComponentRef<typeof NativeSwitch>,SwitchProps&TouchFeedback>(function HapticSwitch({onValueChange,disabled,haptic='selection',...props},ref){
  return <NativeSwitch {...props} ref={ref} disabled={disabled} onValueChange={onValueChange?value=>{if(!disabled&&haptic)feedback(value?'toggleOn':'toggleOff');onValueChange(value);}:undefined}/>;
});
