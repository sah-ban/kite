import {isFid,isHash} from './model';
export function pushRoute(value:unknown,fid:number|undefined){
  const data=value as {type?:unknown;viewerFid?:unknown;kind?:unknown;actor?:unknown;target?:{fid?:unknown;hash?:unknown}}|null;
  if(!fid||!data||data.type!=='kite.activity'||data.viewerFid!==fid)return;
  if(data.kind==='follow'&&isFid(data.actor))return `/profile/${data.actor}` as const;
  if(['mention','reply','like','recast'].includes(String(data.kind))&&isFid(data.target?.fid)&&isHash(data.target?.hash))return `/cast/${data.target.fid}/${String(data.target.hash)}` as const;
}
