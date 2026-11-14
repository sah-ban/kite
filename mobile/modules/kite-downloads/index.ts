import {isRunningInExpoGo,requireOptionalNativeModule} from 'expo';

export type KiteDownloadsNative={
  isSupported:boolean;
  saveImageAsync:(sourceUri:string,fileName:string,mimeType:string)=>Promise<string>;
};
// Expo Go does not contain this app-owned module. Loading the rest of Kite must
// remain possible without it; downloads use the existing folder picker there.
export const nativeDownloads=isRunningInExpoGo()?null:requireOptionalNativeModule<KiteDownloadsNative>('KiteDownloads');
