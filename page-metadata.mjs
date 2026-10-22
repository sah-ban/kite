import {isGuidePath} from './routing.mjs';

export function pageMetadata(pathname,origin=''){
  const guide=isGuidePath(pathname);
  const absolute=path=>origin?new URL(path,origin).href:path;
  return {
    title:guide?'Kite Guide — Your node. Your feed. Your rules.':'Kite — An open source Farcaster client',
    description:guide?'Run your own Snapchain node and Farcaster client. A practical, step-by-step guide to building your own feed.':'Explore Farcaster with chronological feeds, client filters, rich profiles, and more.',
    image:absolute(guide?'/og-guide.png':'/og-client.png'),
    imageAlt:guide?'Kite guide: Your node. Your feed. Your rules.':'Kite, an open source Farcaster client',
    url:absolute(guide?'/guide':pathname==='/index.html'||/^\/client\/?$/.test(pathname)?'/':pathname),
  };
}

// The public URL takes precedence when TLS terminates at a reverse proxy.
export function metadataOrigin(req,config={}){
  const protocol=String(req.headers?.['x-forwarded-proto']||'').split(',')[0].trim()==='https'||req.socket?.encrypted?'https':'http';
  const url=new URL(config.KITE_PUBLIC_URL||`${protocol}://${req.headers?.host||'localhost'}`);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid public origin');
  return url.origin;
}

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderPageMetadata(html,pathname,origin=''){
  const meta=pageMetadata(pathname,origin);
  const tags=[
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}">`,
    `<link rel="canonical" href="${escape(meta.url)}">`,
    ...Object.entries({title:meta.title,description:meta.description,type:'website',site_name:'Kite',url:meta.url,image:meta.image,'image:type':'image/png','image:width':'1200','image:height':'630','image:alt':meta.imageAlt}).map(([key,value])=>`<meta property="og:${key}" content="${escape(value)}">`),
    ...Object.entries({card:'summary_large_image',title:meta.title,description:meta.description,image:meta.image,'image:alt':meta.imageAlt}).map(([key,value])=>`<meta name="twitter:${key}" content="${escape(value)}">`),
  ].join('\n');
  return html.replace(/<!-- kite:metadata:start -->[\s\S]*?<!-- kite:metadata:end -->/,()=>`<!-- kite:metadata:start -->\n${tags}\n<!-- kite:metadata:end -->`);
}
