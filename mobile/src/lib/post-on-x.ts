import {twitterIntent,twitterMediaUrls} from '../../../src/lib/twitter';
import type {Api} from './api';
import type {Cast} from './model';

export async function postOnXIntent(cast:Cast,api:Pick<Api,'profile'|'embed'>){
  const body=cast.data.castAddBody;
  const normalized={...cast,data:{...cast.data,castAddBody:{...body,mentions:body.mentions||[],mentionsPositions:body.mentionsPositions||[],embeds:body.embeds||[]}}};
  const [people,media]=await Promise.all([
    Promise.all([...new Set(normalized.data.castAddBody.mentions)].slice(0,10).map(async fid=>{
      try{return [fid,await api.profile(fid)] as const;}catch{return [fid,{}] as const;}
    })),
    twitterMediaUrls(normalized,url=>api.embed(url)),
  ]);
  return twitterIntent(normalized,Object.fromEntries(people),media);
}
