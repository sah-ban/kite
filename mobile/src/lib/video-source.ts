import {safeLink} from './model';

export function videoSource(value:unknown,mimeType?:unknown){
  const uri=typeof value==='string'?safeLink(value):undefined;if(!uri)return;
  const type=typeof mimeType==='string'?mimeType.split(';')[0].trim().toLowerCase():'';
  const path=new URL(uri).pathname.toLowerCase();
  const contentType: 'hls'|'dash'|'auto'=/^(application\/(vnd\.apple\.mpegurl|x-mpegurl)|audio\/(mpegurl|x-mpegurl))$/.test(type)||path.endsWith('.m3u8')?'hls':type==='application/dash+xml'||path.endsWith('.mpd')?'dash':'auto';
  return {uri,contentType};
}
