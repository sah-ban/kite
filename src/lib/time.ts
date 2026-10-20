import {castDate} from './hub';

export function relativeCastTime(timestamp:number,now=Date.now()):string {
  const seconds=Math.max(0,Math.floor((now-castDate(timestamp).getTime())/1000));
  if(seconds<60)return 'just now';
  const units=[[365*86400,'year'],[30*86400,'month'],[86400,'day'],[3600,'hr'],[60,'min']] as const;
  for(const [size,unit] of units)if(seconds>=size){
    const count=Math.floor(seconds/size);
    return `${count} ${unit}${count>1&&unit!=='min'&&unit!=='hr'?'s':''} ago`;
  }
  return 'just now';
}

export function fullCastTime(timestamp:number):string {
  return castDate(timestamp).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
}
