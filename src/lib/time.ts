import {castDate} from './hub';

export function relativeCastTime(timestamp:number,now=Date.now()):string {
  const seconds=Math.max(0,Math.floor((now-castDate(timestamp).getTime())/1000));
  if(seconds<60)return 'now';
  const units=[[365*86400,'y'],[30*86400,'mo'],[86400,'d'],[3600,'h'],[60,'m']] as const;
  for(const [size,unit] of units)if(seconds>=size){
    const count=Math.floor(seconds/size);
    return `${count}${unit}`;
  }
  return 'now';
}

export function fullCastTime(timestamp:number):string {
  return castDate(timestamp).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
}
