import {safeLink} from './model';

export type MiniAppEmbed={imageUrl:string;buttonTitle:string;url:string;name?:string};
export function miniAppLaunchURL(value:string){
  const target=safeLink(value);if(!target||new URL(target).protocol!=='https:')return;
  const url=new URL('https://farcaster.xyz/~/mini-apps/launch');
  url.searchParams.set('url',target);return url.href;
}
