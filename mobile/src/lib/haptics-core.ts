export type HapticKind='selection'|'light'|'warning'|'success'|'error'|'toggleOn'|'toggleOff';

export function createHapticFeedback({available,perform,now=Date.now}:{available:()=>boolean;perform:(kind:HapticKind)=>Promise<void>;now?:()=>number}){
  let lastTap=-Infinity,lastResult=-Infinity,lastKind:HapticKind|undefined;
  return (kind:HapticKind='selection')=>{
    try{
      if(!available())return;
      const time=now(),result=kind==='success'||kind==='error'||kind==='warning';
      if(result){if(lastKind===kind&&time-lastResult<250)return;lastResult=time;}
      else{if(time-lastTap<60)return;lastTap=time;}
      lastKind=kind;
      void perform(kind).catch(()=>{/* Unsupported devices must not interrupt an action. */});
    }catch{/* Native haptics may also fail synchronously. */}
  };
}
