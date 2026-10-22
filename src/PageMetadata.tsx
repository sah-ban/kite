import {useEffect} from 'react';
// @ts-expect-error Metadata is shared with the production HTML handler.
import {pageMetadata} from '../page-metadata.mjs';

export function PageMetadata({page}:{page:'client'|'guide'}){
  useEffect(()=>{
    const update=()=>{
      const meta=pageMetadata(location.pathname,location.origin);
      document.title=meta.title;
      const content:Record<string,string>={description:meta.description,'og:title':meta.title,'og:description':meta.description,'og:url':meta.url,'og:image':meta.image,'og:image:alt':meta.imageAlt,'twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image,'twitter:image:alt':meta.imageAlt};
      for(const [name,value] of Object.entries(content))document.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.setAttribute('content',value);
      document.querySelector('link[rel="canonical"]')?.setAttribute('href',meta.url);
    };
    update();window.addEventListener('popstate',update);
    return()=>window.removeEventListener('popstate',update);
  },[page]);
  return null;
}
