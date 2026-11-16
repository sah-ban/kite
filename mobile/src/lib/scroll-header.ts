export type ScrollHeaderState={offset:number;direction:number;travel:number;hidden:boolean};
export const initialScrollHeader:ScrollHeaderState={offset:0,direction:0,travel:0,hidden:false};

export function scrollHeader(state:ScrollHeaderState,offset:number):ScrollHeaderState{
  if(!Number.isFinite(offset))return state;
  const y=Math.max(0,offset),delta=y-state.offset;
  if(y<=4)return {...initialScrollHeader,offset:y};
  if(delta===0)return state;
  const direction=Math.sign(delta),travel=Math.min(100,direction===state.direction?state.travel+Math.abs(delta):Math.abs(delta));
  const hidden=direction>0&&y>56&&travel>=12?true:direction<0&&travel>=8?false:state.hidden;
  return {offset:y,direction,travel,hidden};
}
