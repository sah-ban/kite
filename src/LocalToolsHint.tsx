import {ArrowUpRight} from 'lucide-react';
const copy={
  fname:{title:'Change your fname on localhost',text:'Run Kite locally to change your username (fname) using your custody recovery phrase.'},
  account:{title:'More account tools on localhost',text:'Import an existing signer, register a gasless app key with a custody phrase, or unlock and manage saved local keys.'},
};
export function LocalToolsHint({kind}:{kind:keyof typeof copy}){
  const {title,text}=copy[kind];
  return <section className="local-tools-hint" aria-label={title}>
    <h3>{title}</h3><p>{text}</p>
    <a href="https://github.com/sah-ban/freecast#readme" target="_blank" rel="noopener noreferrer">Local setup instructions <ArrowUpRight size={13}/></a>
  </section>;
}
