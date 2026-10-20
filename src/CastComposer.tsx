import { useEffect, useRef, useState } from 'react';
import { PenLine, ChevronUp } from 'lucide-react';
import type { Config, Profile } from './lib/hub';
import type { Session } from './lib/signing';
import type { DraftMention } from './lib/mentions';
import { composerUsage, type CastLimits } from './lib/cast-limits';
import { Avatar } from './social-ui';
import { MentionComposer } from './MentionComposer';
import { ImageAttachments } from './ImageAttachments';
import { LinkAttachments, useComposerLinks } from './LinkAttachments';
import { ComposerUsage } from './ComposerUsage';

export function CastComposer({config,session,person,candidates,text,mentions,onText,images,onImages,links,limits,publishing,uploading,onUploading,onPublish,onConnect,modal=false}:{
  config:Config;session:Session|null;person?:Profile;candidates:Profile[];text:string;mentions:DraftMention[];onText:(text:string,mentions:DraftMention[])=>void;images:string[];onImages:(images:string[])=>void;links:ReturnType<typeof useComposerLinks>;limits:CastLimits;publishing:boolean;uploading:boolean;onUploading:(busy:boolean)=>void;onPublish:()=>Promise<boolean>;onConnect:()=>void;modal?:boolean;
}) {
  const [expanded,setExpanded]=useState(modal),input=useRef<HTMLTextAreaElement>(null);
  const usage=composerUsage(text,mentions,images.length+links.urls.length,limits),hasDraft=Boolean(text||images.length||links.urls.length);
  useEffect(()=>{if(expanded)input.current?.focus();},[expanded]);
  return <div className={`composer cast-composer ${expanded?'composer-expanded':'composer-compact'}${modal?' modal-composer':''}`}>
    <Avatar person={person}/><div>
      {expanded?<>
        <div className="composer-identity"><span>{person?.username?`@${person.username}`:person?.name||'Your account'}</span>{!modal&&<button type="button" className="icon-button" aria-label="Collapse composer" disabled={publishing||uploading} onClick={()=>setExpanded(false)}><ChevronUp size={18}/></button>}</div>
        <MentionComposer config={config} inputRef={input} value={text} mentions={mentions} candidates={candidates} onChange={onText} placeholder="What’s happening?" label="Cast text" rows={modal?5:3} disabled={publishing}/>
        {hasDraft&&<ComposerUsage usage={usage} limits={limits}/>}
        <div className="composer-tools">
          <ImageAttachments compact images={images} max={limits.maxEmbeds} reserved={links.urls.length} onChange={onImages} onBusy={onUploading} disabled={publishing||!session}/>
          <LinkAttachments compact links={links} available={limits.maxEmbeds-images.length} disabled={publishing||uploading||!session}/>
          {uploading&&<span className="small muted" role="status">Uploading…</span>}
          <button type="button" className="button primary small-button composer-publish" disabled={publishing||uploading||Boolean(usage.error)||!hasDraft||(!text.trim()&&!images.length&&!links.urls.length)} onClick={async()=>{if(await onPublish())setExpanded(modal);}}>{publishing?'Publishing…':'Publish cast'}</button>
        </div>
      </>:<button type="button" className="composer-prompt" onClick={()=>session?setExpanded(true):onConnect()}><span>{hasDraft?'Continue your cast…':'What’s happening?'}</span><PenLine size={19}/></button>}
    </div>
  </div>;
}
