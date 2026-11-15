import {Parser} from 'htmlparser2';
import {xPostURL} from './x-post-url.mjs';

const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
const handle=value=>typeof value==='string'&&/^[a-zA-Z0-9_]{1,15}$/.test(value)?value:undefined;
function decodeText(value){
  if(!value.includes('&'))return value;
  let decoded='';const parser=new Parser({ontext:part=>{decoded+=part;}},{decodeEntities:true});
  parser.end(value.replace(/</g,'&lt;'));return decoded;
}
function asset(value){
  try{const url=new URL(value);if(url.href.length<=4096&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.hostname==='pbs.twimg.com')return url.href;}catch{}
}
function date(value,id){
  const time=typeof value==='string'?Date.parse(value):NaN;
  return new Date(Number.isFinite(time)?time:Number(BigInt(id)>>22n)+1288834974657).toISOString();
}
export function parseXPost(data,id){
  if(!data||data.id_str!==id||typeof data.text!=='string'||!handle(data.user?.screen_name))throw new Error('X post unavailable.');
  const username=handle(data.user.screen_name),media=[];
  for(const item of (Array.isArray(data.mediaDetails)?data.mediaDetails:[]).slice(0,4)){
    const url=asset(item.media_url_https);if(url&&['photo','video','animated_gif'].includes(item.type))media.push({url,kind:item.type==='photo'?'image':'video'});
  }
  if(!media.length)for(const photo of (Array.isArray(data.photos)?data.photos:[]).slice(0,4)){const url=asset(photo.url);if(url)media.push({url,kind:'image'});}
  const original=text(data.text,10000),range=data.display_text_range;
  const start=Array.isArray(range)&&Number.isInteger(range[0])&&range[0]>=0&&range[0]<=original.length?range[0]:0;
  const end=Array.isArray(range)&&Number.isInteger(range[1])&&range[1]>=start&&range[1]<=original.length?range[1]:original.length;
  const edits=[...(Array.isArray(data.entities?.media)?data.entities.media:[]).map(item=>({...item,replacement:''})),...(Array.isArray(data.entities?.urls)?data.entities.urls:[]).map(item=>({...item,replacement:typeof item.expanded_url==='string'?item.expanded_url:item.url}))]
    .filter(item=>Array.isArray(item.indices)&&item.indices.length===2&&Number.isInteger(item.indices[0])&&Number.isInteger(item.indices[1])&&item.indices[0]>=start&&item.indices[1]>item.indices[0]&&item.indices[1]<=end&&original.slice(item.indices[0],item.indices[1])===item.url)
    .sort((a,b)=>a.indices[0]-b.indices[0]);
  let content='',cursor=start;
  for(const item of edits){if(item.indices[0]<cursor)continue;content+=decodeText(original.slice(cursor,item.indices[0]))+text(item.replacement,2048);cursor=item.indices[1];}
  content=(content+decodeText(original.slice(cursor,end))).trim();
  if(!content&&!media.length)throw new Error('X post unavailable.');
  return {id,url:`https://x.com/${username}/status/${id}`,username,name:text(data.user.name,100)||username,avatar:asset(data.user.profile_image_url_https),text:content,createdAt:date(data.created_at,id),media};
}
export function parseXPostOEmbed(data,id){
  if(xPostURL(data?.url)?.id!==id||typeof data.html!=='string'||data.html.length>128000)throw new Error('X post unavailable.');
  let username;try{const url=new URL(data.author_url);if(['x.com','twitter.com'].includes(url.hostname))username=handle(url.pathname.slice(1));}catch{}
  if(!username)throw new Error('X author unavailable.');
  let paragraph=false,finished=false,skip=0,content='';
  const parser=new Parser({onopentag(name){if(name==='p'&&!finished)paragraph=true;if(name==='script'||name==='style')skip++;if(name==='br'&&paragraph&&!skip)content+='\n';},ontext(value){if(paragraph&&!skip&&content.length<10000)content+=value;},onclosetag(name){if(name==='p'&&paragraph){paragraph=false;finished=true;}if(name==='script'||name==='style')skip=Math.max(0,skip-1);}},{decodeEntities:true});
  parser.end(data.html);
  if(!content.trim())throw new Error('X post text unavailable.');
  return {id,url:`https://x.com/${username}/status/${id}`,username,name:text(data.author_name,100)||username,text:content.trim(),createdAt:date(undefined,id),media:[]};
}
export async function loadXPost(reference,loadJSON,deadline=Date.now()+12000){
  const {id}=reference,token=(Number(id)/1e15*Math.PI).toString(36).replace(/(0+|\.)/g,'');
  try{return parseXPost(await loadJSON('https://cdn.syndication.twimg.com/tweet-result?'+new URLSearchParams({id,lang:'en',token}),Math.min(deadline,Date.now()+6500)),id);}
  catch{
    try{return parseXPostOEmbed(await loadJSON('https://publish.twitter.com/oembed?'+new URLSearchParams({url:reference.url,omit_script:'true',hide_thread:'true',dnt:'true'}),deadline),id);}
    catch{return {id,url:reference.url,text:'',media:[],unavailable:true};}
  }
}
