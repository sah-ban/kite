import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import vm from 'node:vm';

type Options={expoGo?:boolean;version?:number;missing?:boolean;failSave?:boolean};
async function harness(options:Options={}){
  const state={expoGo:false,version:33,missing:false,failSave:false,...options,lookup:0,picker:0,alerts:0,native:[] as {uri:string;name:string;mime:string}[],copies:0,cleanups:0,stored:null as string|null};
  const mocks:Record<string,string>={
    expo:`export const isRunningInExpoGo=()=>state.expoGo;export const requireOptionalNativeModule=()=>{state.lookup++;return state.missing?null:{isSupported:state.version>=29,saveImageAsync:async(uri,name,mime)=>{state.native.push({uri,name,mime});if(state.failSave)throw Error('Disk unavailable');return 'content://downloads/1';}};};`,
    'react-native':`export const Platform={OS:'android',Version:state.version};export const Alert={alert:(title,message,buttons)=>{state.alerts++;buttons.find(button=>button.text==='Choose folder').onPress();}};`,
    '@react-native-async-storage/async-storage':`export default {getItem:async()=>state.stored,setItem:async(key,value)=>{state.stored=value;},removeItem:async()=>{state.stored=null;}};`,
    'expo-file-system':`export const Paths={cache:'file:///cache'};export const FileMode={ReadOnly:'r'};
      export class Directory{constructor(...parts){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/');this.exists=true;}create(){}delete(){state.cleanups++;this.exists=false;}createFile(name,mime){return new File(this,name);}static async pickDirectoryAsync(){state.picker++;return new Directory('content://com.android.externalstorage.documents/tree/primary%3ADownload%2FKite');}}
      export class File{constructor(...parts){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/');}static async downloadFileAsync(url,file){return file;}open(){return {readBytes:async()=>new TextEncoder().encode('GIF89a'),close(){}};}async copy(target){state.copies++;}async delete(){}}`,
  };
  const bundle=await build({entryPoints:[resolve('src/lib/download-image.ts')],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent',plugins:[{name:'native-test-adapters',setup(build){build.onResolve({filter:/^(expo|react-native|expo-file-system|@react-native-async-storage\/async-storage)$/},args=>({path:args.path,namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
  const module={exports:{} as {downloadImage:(url:string)=>Promise<string>}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,state,URL,TextEncoder,Uint8Array,AbortSignal,console});
  return {state,download:module.exports.downloadImage};
}
test('installed Android uses MediaStore without selecting a folder and keeps GIF format',async()=>{
  const h=await harness();assert.equal(await h.download('https://images.example/opaque'),'Saved to Download/Kite');
  assert.equal(h.state.native.length,1);assert.match(h.state.native[0].name,/^kite-\d+-\d+\.gif$/);assert.equal(h.state.native[0].mime,'image/gif');assert.ok(h.state.native[0].uri.startsWith('file:///cache/'));
  assert.equal(h.state.alerts,0);assert.equal(h.state.picker,0);assert.equal(h.state.copies,0);assert.equal(h.state.cleanups,1);
});
test('Expo Go never loads the native module and retains the remembered folder fallback',async()=>{
  const h=await harness({expoGo:true});await h.download('https://images.example/one');await h.download('https://images.example/two');
  assert.equal(h.state.lookup,0);assert.equal(h.state.native.length,0);assert.equal(h.state.picker,1);assert.equal(h.state.alerts,1);assert.equal(h.state.copies,2);assert.equal(h.state.cleanups,2);
});
test('older Android and older app builds retain the folder fallback',async()=>{
  for(const options of [{version:28},{missing:true}]){const h=await harness(options);await h.download('https://images.example/one');assert.equal(h.state.native.length,0);assert.equal(h.state.picker,1);assert.equal(h.state.copies,1);}
});
test('a native export failure cleans the cache and does not retry through a folder picker',async()=>{
  const h=await harness({failSave:true});await assert.rejects(h.download('https://images.example/one'),/Disk unavailable/);
  assert.equal(h.state.native.length,1);assert.equal(h.state.picker,0);assert.equal(h.state.alerts,0);assert.equal(h.state.cleanups,1);
});
