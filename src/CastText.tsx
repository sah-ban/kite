import type { Cast, Config } from './lib/hub';
import { castPath } from './lib/social';
import { castTextParts } from './lib/mentions';
import { useProfile } from './social-ui';

function Mention({config,fid,visible,onProfile}:{config:Config;fid:number;visible:boolean;onProfile:(fid:number)=>void}) {
  const person=useProfile(config,visible?fid:0);
  return <a className="cast-mention" href={`/profile/${fid}`} title={`View profile · FID ${fid}`} onClick={event=>{event.preventDefault();event.stopPropagation();onProfile(fid);}}>@{person?.username||`FID${fid}`}</a>;
}

export function CastText({config,cast,visible,onProfile,onOpen,limit,className='cast-text'}:{config:Config;cast:Cast;visible:boolean;onProfile:(fid:number)=>void;onOpen?:(cast:Cast)=>void;limit?:number;className?:string}) {
  const body=cast.data.castAddBody;
  const {parts,truncated}=castTextParts(body.text,body.mentions,body.mentionsPositions,limit);
  const open=(event:React.MouseEvent<HTMLAnchorElement>)=>{event.preventDefault();onOpen?.(cast);};
  return <p className={className}>{parts.map((part,i)=>part.fid!==undefined?<Mention key={i} config={config} fid={part.fid} visible={visible} onProfile={onProfile}/>:onOpen?<a key={i} className="cast-permalink" href={castPath(cast)} onClick={open}>{part.text}</a>:<span key={i}>{part.text}</span>)}{truncated&&onOpen&&<a className="read-full" href={castPath(cast)} onClick={open}>Read full cast →</a>}</p>;
}
