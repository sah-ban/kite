import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { invalidateProfile, profile, type Config, type Profile } from './lib/hub';
import { embedURL } from './lib/embeds';
import { githubHandle, readVerifiedWallets, walletAddress, type Wallet } from './lib/profile-about';
import { Avatar } from './social-ui';
import { ConnectedClients } from './ConnectedClients';
import { JoinedDate } from './JoinedDate';
import { ProBadge } from './ProBadge';
import { ProfileStorage } from './ProfileStorage';
import { ProfileLocation } from './ProfileLocation';

function WalletLink({wallet,primary=false}:{wallet:Wallet;primary?:boolean}) {
  const name=wallet.protocol==='ethereum'?'Ethereum':'Solana';
  const href=wallet.protocol==='ethereum'?`https://etherscan.io/address/${wallet.address}`:`https://solscan.io/account/${wallet.address}`;
  return <div className="about-wallet"><span>{name}{primary?' · Primary':''}</span><a href={href} target="_blank" rel="noreferrer"><code>{wallet.address}</code><ArrowUpRight size={14}/></a></div>;
}

export function ProfileAbout({config,fid,revision,onProfile}:{config:Config;fid:number;revision:number;onProfile:(fid:number)=>void}) {
  const [person,setPerson]=useState<Profile>(),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  const [wallets,setWallets]=useState<Wallet[]>(),[walletError,setWalletError]=useState(false),[walletRetry,setWalletRetry]=useState(0);
  useEffect(()=>{
    let active=true;setPerson(undefined);setError(false);
    profile(config,fid).then(value=>{if(active)setPerson(value);}).catch(()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[config,fid,revision,retry]);
  useEffect(()=>{
    const abort=new AbortController();setWallets(undefined);setWalletError(false);
    readVerifiedWallets(config,fid,abort.signal).then(value=>{if(!abort.signal.aborted)setWallets(value);}).catch(()=>{if(!abort.signal.aborted)setWalletError(true);});
    return()=>abort.abort();
  },[config,fid,revision,retry,walletRetry]);
  const github=githubHandle(person?.githubUsername),website=person?.website?embedURL(person.website):undefined,live=person?.liveActivityUrl?embedURL(person.liveActivityUrl):undefined;
  const primary:Wallet[]=[];
  for(const [protocol,value] of [['ethereum',person?.primaryEthereumAddress],['solana',person?.primarySolanaAddress]] as const){const address=walletAddress(value,protocol);if(address)primary.push({protocol,address});}
  const otherWallets=wallets?.filter(wallet=>!primary.some(p=>p.protocol===wallet.protocol&&p.address===wallet.address));
  const refresh=()=>{invalidateProfile(fid);setRetry(value=>value+1);};
  return <section className="profile-about" aria-label="About profile">
    <div className="detail-heading"><button className="icon-button" aria-label="Back to profile" onClick={()=>onProfile(fid)}><ArrowLeft size={18}/></button><h1>About</h1><button className="icon-button" aria-label="Refresh profile details" onClick={refresh}><RefreshCw size={18}/></button></div>
    <div className="about-content">
      <div className="about-person"><button className="avatar-link" onClick={()=>onProfile(fid)} aria-label="Open profile"><Avatar person={person}/></button><div><button className="about-name" onClick={()=>onProfile(fid)}>{person?.name||`FID ${fid}`}</button> <ProBadge config={config} fid={fid}/><p>{person?.username?`@${person.username} · `:''}FID {fid}</p></div></div>
      {error?<p className="about-status" role="alert">Couldn’t load profile details. <button className="text-button" onClick={refresh}>Retry</button></p>:!person?<p className="about-status" role="status">Loading profile details…</p>:<>
        <section className="about-section"><h2>Profile details</h2><dl className="about-fields"><div><dt>FID</dt><dd>{fid}</dd></div>{person.username&&<div><dt>Username</dt><dd>@{person.username}</dd></div>}{website&&<div><dt>Website</dt><dd><a href={website} target="_blank" rel="noreferrer">{person.website}<ArrowUpRight size={14}/></a></dd></div>}{person.location&&<div><dt>Location</dt><dd><ProfileLocation value={person.location}/></dd></div>}{live&&<div><dt>Live activity</dt><dd><a href={live} target="_blank" rel="noreferrer">{person.liveActivityUrl}<ArrowUpRight size={14}/></a></dd></div>}{person.profileToken&&<div><dt>Profile token</dt><dd><code>{person.profileToken}</code></dd></div>}</dl><JoinedDate fid={fid} revision={revision+retry}/></section>
        <section className="about-section"><h2>Social accounts</h2>{person.twitterUsername||github?<div className="about-socials">{person.twitterUsername&&<a href={`https://x.com/${person.twitterUsername}`} target="_blank" rel="noreferrer"><span><strong>X</strong><small>@{person.twitterUsername}</small></span><ArrowUpRight size={16}/></a>}{github&&<a href={`https://github.com/${github}`} target="_blank" rel="noreferrer"><span><strong>GitHub</strong><small>{github}</small></span><ArrowUpRight size={16}/></a>}</div>:<p className="about-status">No social accounts shared on this profile.</p>}</section>
      </>}
      <ProfileStorage key={retry} config={config} fid={fid} revision={revision}/>
      <section className="about-section"><h2>Linked wallets</h2>{primary.map(wallet=><WalletLink key={`${wallet.protocol}:${wallet.address}`} wallet={wallet} primary/>)}{walletError?<p className="about-status" role="status">Couldn’t load additional wallets. <button className="text-button" onClick={()=>setWalletRetry(value=>value+1)}>Retry wallets</button></p>:!wallets?<p className="about-status" role="status">Loading linked wallets…</p>:<>{otherWallets?.map(wallet=><WalletLink key={`${wallet.protocol}:${wallet.address}`} wallet={wallet}/>)}{!primary.length&&!wallets.length&&<p className="about-status">No linked wallets shared on this profile.</p>}</>}</section>
      <div className="about-section"><ConnectedClients key={retry} config={config} fid={fid} revision={revision} onProfile={onProfile}/></div>
    </div>
  </section>;
}
