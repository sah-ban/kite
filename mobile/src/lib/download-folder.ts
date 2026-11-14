import {ImageSaveCancelledError,ImageSavePermissionError} from './download-image-core';

export const DOWNLOAD_FOLDER_KEY='kite.download-folder.v1';
export const DOWNLOAD_FOLDER_HINT='content://com.android.externalstorage.documents/document/primary%3ADownload%2FKite';
export function isKiteDownloadFolder(value:string){
  try{
    const uri=new URL(value),tree=uri.pathname.match(/^\/tree\/([^/]+)(?:\/document\/([^/]+))?\/?$/);
    return uri.protocol==='content:'&&uri.hostname==='com.android.externalstorage.documents'&&!uri.username&&!uri.password&&!uri.search&&!uri.hash&&!!tree&&decodeURIComponent(tree[1])==='primary:Download/Kite'&&(!tree[2]||decodeURIComponent(tree[2])==='primary:Download/Kite');
  }catch{return false;}
}
type Store={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;removeItem:(key:string)=>Promise<void>};
export function createDownloadFolder(store:Store,io:{exists:(uri:string)=>Promise<boolean>;pick:()=>Promise<string|null>}){
  let pending:Promise<string>|undefined;
  async function resolve(){
    const saved=await store.getItem(DOWNLOAD_FOLDER_KEY);
    if(saved&&isKiteDownloadFolder(saved)&&await io.exists(saved))return saved;
    if(saved)await store.removeItem(DOWNLOAD_FOLDER_KEY);
    const uri=await io.pick();if(!uri)throw new ImageSaveCancelledError();
    if(!isKiteDownloadFolder(uri))throw new ImageSavePermissionError('Select Internal storage → Download → Kite. Create the Kite folder there if needed, then try again.');
    if(!await io.exists(uri))throw new ImageSavePermissionError('The download folder is unavailable. Select Download/Kite again.');
    await store.setItem(DOWNLOAD_FOLDER_KEY,uri);return uri;
  }
  return ()=>pending||=(resolve().finally(()=>{pending=undefined;}));
}
