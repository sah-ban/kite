import {Directory,File,FileMode,Paths} from 'expo-file-system';
import {Asset,requestPermissionsAsync} from 'expo-media-library';
import {Platform} from 'react-native';
import {saveDownloadedImage} from './download-image-core';

let sequence=0;
export async function downloadImage(url:string):Promise<string>{
  const name=`kite-${Date.now()}-${++sequence}`,directory=new Directory(Paths.cache,name);
  let file=new File(directory,'image.download');
  await saveDownloadedImage(url,{
    requestPermission:async()=>Platform.OS==='android'&&Number(Platform.Version)>=30?true:(await requestPermissionsAsync(true,[])).granted,
    download:async source=>{directory.create();file=await File.downloadFileAsync(source,file,{signal:AbortSignal.timeout(65000)});},
    header:async()=>{const handle=file.open(FileMode.ReadOnly);try{return await handle.readBytes(64);}finally{handle.close();}},
    save:async extension=>{await file.rename(`${name}.${extension}`);await Asset.create(file.uri);},
    cleanup:async()=>{if(directory.exists)await directory.delete();},
  });
  return 'Image saved to gallery';
}
