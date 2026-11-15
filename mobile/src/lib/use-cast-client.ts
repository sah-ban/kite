import {useApp} from './state';
import {useQuery} from './hooks';

export function useCastClient(fid:number,signer:string,enabled=true){
  const {api}=useApp();
  return useQuery(async()=>{
    if(!enabled)return;
    const requester=await api.signerRequester(fid,signer);if(!requester)return;
    const profile=await api.profile(requester).catch(()=>undefined);
    return {fid:requester,username:profile?.username,avatar:profile?.avatar};
  },[api,fid,signer,enabled]);
}
