import {xPostURL} from '../../../x-post-url.mjs';
import {relativeTime} from './model';

export type XPost={id:string;url:string;name?:string;username?:string;avatar?:string;text:string;createdAt?:string;media:{url:string;kind:'image'|'video'}[];unavailable?:boolean};
export const xPostLink=(value:string)=>xPostURL(value)?.url;
export function xPostTime(value:string|undefined){
  const time=value?Date.parse(value):NaN;
  return Number.isFinite(time)?relativeTime(Math.floor(time/1000)-1609459200):undefined;
}
