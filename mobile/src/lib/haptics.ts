import * as Haptics from 'expo-haptics';
import {AppState,Platform} from 'react-native';
import {createHapticFeedback,type HapticKind} from './haptics-core';

export type {HapticKind} from './haptics-core';
let enabled=true;
export function configureHaptics(value:boolean){enabled=value;}
export const feedback=createHapticFeedback({
  available:()=>enabled&&Platform.OS!=='web'&&AppState.currentState==='active',
  perform:kind=>{
    if(Platform.OS==='android'){
      const effects:Record<HapticKind,Haptics.AndroidHaptics>={selection:Haptics.AndroidHaptics.Segment_Tick,light:Haptics.AndroidHaptics.Virtual_Key,warning:Haptics.AndroidHaptics.Long_Press,success:Haptics.AndroidHaptics.Confirm,error:Haptics.AndroidHaptics.Reject,toggleOn:Haptics.AndroidHaptics.Toggle_On,toggleOff:Haptics.AndroidHaptics.Toggle_Off};
      return Haptics.performAndroidHapticsAsync(effects[kind]);
    }
    if(kind==='success'||kind==='error'||kind==='warning')return Haptics.notificationAsync(kind==='success'?Haptics.NotificationFeedbackType.Success:kind==='error'?Haptics.NotificationFeedbackType.Error:Haptics.NotificationFeedbackType.Warning);
    return kind==='light'?Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light):Haptics.selectionAsync();
  },
});
export async function withHapticResult<T>(action:()=>Promise<T>):Promise<T>{
  try{const value=await action();feedback('success');return value;}
  catch(error){feedback('error');throw error;}
}
