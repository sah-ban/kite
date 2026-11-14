import AsyncStorage from '@react-native-async-storage/async-storage';
import {Directory,File,FileMode,Paths} from 'expo-file-system';
import {Alert,Platform} from 'react-native';
import {ImageSaveCancelledError,saveDownloadedImage} from './download-image-core';
import {createDownloadFolder,DOWNLOAD_FOLDER_HINT} from './download-folder';

const downloadFolder=createDownloadFolder(AsyncStorage,{
  exists:async uri=>{try{return new Directory(uri).exists;}catch{return false;}},
  pick:async()=>{
    const proceed=await new Promise<boolean>(resolve=>Alert.alert('Save to Download/Kite','Open Internal storage → Download, create or select the Kite folder, then tap “Use this folder”. Kite will remember this location.',[{text:'Cancel',style:'cancel',onPress:()=>resolve(false)},{text:'Choose folder',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));
    if(!proceed)return null;
    try{return (await Directory.pickDirectoryAsync(DOWNLOAD_FOLDER_HINT)).uri;}
    catch(error){if(error&&typeof error==='object'&&'code' in error&&/PICKER_CANCELLED/.test(String(error.code)))return null;throw error;}
  },
});
const mimeTypes:Record<string,string>={png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',tiff:'image/tiff',avif:'image/avif',heic:'image/heic',heif:'image/heif'};
let sequence=0;
export async function downloadImage(url:string):Promise<string>{
  if(Platform.OS!=='android')throw new ImageSaveCancelledError();
  const name=`kite-${Date.now()}-${++sequence}`,directory=new Directory(Paths.cache,name);
  let file=new File(directory,'image.download'),destination:Directory|undefined;
  await saveDownloadedImage(url,{
    requestPermission:async()=>{destination=new Directory(await downloadFolder());return true;},
    download:async source=>{directory.create();file=await File.downloadFileAsync(source,file,{signal:AbortSignal.timeout(65000)});},
    header:async()=>{const handle=file.open(FileMode.ReadOnly);try{return await handle.readBytes(64);}finally{handle.close();}},
    save:async extension=>{
      const target=destination!.createFile(`${name}.${extension}`,mimeTypes[extension]);
      try{await file.copy(target,{overwrite:true});}
      catch(error){try{await target.delete();}catch{}throw error;}
    },
    cleanup:async()=>{if(directory.exists)await directory.delete();},
  });
  return 'Saved to Download/Kite';
}
