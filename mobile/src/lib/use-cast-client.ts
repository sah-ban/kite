import {useApp} from './state';
import {useQuery} from './hooks';
import {resolveCastClient} from './cast-clients';

export function useCastClient(fid:number,signer:string,enabled=true){
  const {api,profileRevision}=useApp();
  return useQuery(()=>enabled?resolveCastClient(api,fid,signer):Promise.resolve(undefined),[api,fid,signer,enabled,profileRevision]);
}
