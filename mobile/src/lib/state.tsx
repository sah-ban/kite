import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {useColorScheme} from 'react-native';
import {createApi, type Api} from './api';
import {castKey,normalizeServer} from './model';
import type {Cast} from './model';
import {deviceAccount} from './account';
import type {AccountSnapshot} from './account-core';
import type {CastInput} from './composer';
import {runCastEdit} from './cast-edit';

export type ThemeMode = 'system'|'light'|'dark';
const palettes = {
  light: {background:'#fafaf9',surface:'#ffffff',soft:'#f0f0ed',ink:'#18221e',muted:'#737b75',line:'#e4e7e1',accent:'#326d49',accentSoft:'#e9f1e7',danger:'#b33a32'},
  dark: {background:'#111714',surface:'#18201c',soft:'#212c25',ink:'#eef2eb',muted:'#a0ada3',line:'#303d34',accent:'#a5d6a4',accentSoft:'#273c2b',danger:'#ffaaa0'},
};
export type Colors = typeof palettes.light;
type ReactionOverride={active:boolean;count:number|null;more:boolean};
type State = {api:Api;theme:ThemeMode;dark:boolean;colors:Colors;ready:boolean;setTheme:(value:ThemeMode)=>Promise<void>;
  account:AccountSnapshot;accountBusy:boolean;accountError:string;beginSignIn:()=>Promise<AccountSnapshot>;checkSignIn:()=>Promise<AccountSnapshot>;signOut:()=>Promise<AccountSnapshot>;
  reactions:Map<string,ReactionOverride>;react:(cast:Cast,kind:'likes'|'recasts',active:boolean,count:number|null,more:boolean)=>Promise<void>;
  publish:(input:CastInput)=>Promise<Cast>;publishing:boolean;published:Cast[];publishNotice:Cast|null;dismissPublishNotice:()=>void;
  deletedCasts:Set<string>;deleteCast:(cast:Cast)=>Promise<void>;
  replaceCast:(source:Cast,input:CastInput,onProgress:(message:string)=>void,onPrepared:()=>void)=>Promise<Cast>};
export const reactionKey=(fid:number,cast:Cast,kind:'likes'|'recasts')=>`${fid}:${cast.data.fid}:${cast.hash.toLowerCase()}:${kind}`;
const Context = createContext<State|null>(null);
const SETTINGS = 'kite.mobile.settings.v1';
const defaultServer = normalizeServer(Constants.expoConfig?.extra?.apiUrl || 'https://kite.sahban.dev');
export function AppProvider({children}:{children:ReactNode}) {
  const system = useColorScheme();
  const [theme,changeTheme] = useState<ThemeMode>('system'), [ready,setReady] = useState(false);
  const [api]=useState(()=>createApi(defaultServer));
  const [device]=useState(()=>deviceAccount(api));
  const [account,setAccount]=useState<AccountSnapshot>({session:null,pending:null,hasSavedKey:false}),[accountBusy,setAccountBusy]=useState(false),[accountError,setAccountError]=useState('');
  const [reactions,setReactions]=useState<Map<string,ReactionOverride>>(()=>new Map());
  const [publishing,setPublishing]=useState(false),[published,setPublished]=useState<Cast[]>([]),[publishNotice,setPublishNotice]=useState<Cast|null>(null);
  const publishLock=useRef(false);
  const [deletedCasts,setDeletedCasts]=useState<Set<string>>(()=>new Set());
  useEffect(()=>{
    let active=true;
    const preferences=AsyncStorage.getItem(SETTINGS).then(value=>{
      if(!value||!active)return;
      const saved=JSON.parse(value);
      if(['system','light','dark'].includes(saved.theme))changeTheme(saved.theme);
    }).catch(()=>{/* Defaults remain usable if storage is unavailable. */});
    const connection=device.restore().then(value=>{if(active)setAccount(value);}).catch(()=>{if(active){setAccount(device.snapshot());setAccountError('Could not unlock your saved account. Sign out to reset this connection.');}});
    void Promise.all([preferences,connection]).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;};
  },[device]);
  const runAccount=useCallback(async(method:'begin'|'check'|'signOut')=>{
    setAccountBusy(true);setAccountError('');
    try{const value=await device[method]();setAccount(value);if(method==='signOut')setReactions(new Map());return value;}
    catch(error){setAccountError(error instanceof Error?error.message:'Could not connect your account. Please try again.');throw error;}
    finally{setAccountBusy(false);}
  },[device]);
  const beginSignIn=useCallback(()=>runAccount('begin'),[runAccount]);
  const checkSignIn=useCallback(()=>runAccount('check'),[runAccount]);
  const signOut=useCallback(()=>runAccount('signOut'),[runAccount]);
  async function react(cast:Cast,kind:'likes'|'recasts',active:boolean,count:number|null,more:boolean){
    const session=account.session;if(!session)throw new Error('Sign in to Kite first.');
    await device.react(cast,kind,active);
    setReactions(previous=>{const next=new Map(previous);const key=reactionKey(session.fid,cast,kind),before=next.get(key);const baseline=before?.count??count;next.set(key,{active:!active,count:baseline===null?null:more?baseline:Math.max(0,baseline+(active?-1:1)),more});if(next.size>500)next.delete(next.keys().next().value!);return next;});
  }
  async function publish(input:CastInput){
    if(publishLock.current)throw new Error('Your cast is already being published.');
    publishLock.current=true;setPublishing(true);
    try{const cast=await device.cast(input);api.rememberCast(cast);setPublished(previous=>[cast,...previous.filter(value=>value.hash!==cast.hash)].slice(0,30));setPublishNotice(cast);return cast;}
    finally{publishLock.current=false;setPublishing(false);}
  }
  async function deleteCast(cast:Cast){
    await device.deleteCast(cast);
    markDeleted(cast);
  }
  function markDeleted(cast:Cast){
    const key=castKey(cast);
    setDeletedCasts(previous=>new Set([...previous,key]));
    setPublished(previous=>previous.filter(value=>castKey(value)!==key));
    setPublishNotice(previous=>previous&&castKey(previous)===key?null:previous);
  }
  async function replaceCast(source:Cast,input:CastInput,onProgress:(message:string)=>void,onPrepared:()=>void){
    const session=account.session;if(!session)throw new Error('Sign in to Kite first.');
    if(publishLock.current)throw new Error('Your cast is already being published.');
    publishLock.current=true;setPublishing(true);
    try{
      const cast=await runCastEdit({source,input,session,origin:api.origin,storage:AsyncStorage,prepare:device.prepareReplacement,validate:device.validatePreparedCast,remove:device.deleteCast,submit:device.submitPreparedCast,onDeleted:()=>markDeleted(source),onProgress,onPrepared});
      api.rememberCast(cast);setPublished(previous=>[cast,...previous.filter(value=>value.hash!==cast.hash)].slice(0,30));setPublishNotice(cast);return cast;
    }finally{publishLock.current=false;setPublishing(false);}
  }
  const dark=theme==='dark'||(theme==='system'&&system==='dark');
  async function setTheme(value:ThemeMode){await AsyncStorage.setItem(SETTINGS,JSON.stringify({theme:value}));changeTheme(value);}
  return <Context.Provider value={{api,theme,dark,colors:palettes[dark?'dark':'light'],ready,setTheme,account,accountBusy,accountError,beginSignIn,checkSignIn,signOut,reactions,react,publish,publishing,published,publishNotice,dismissPublishNotice:()=>setPublishNotice(null),deletedCasts,deleteCast,replaceCast}}>{children}</Context.Provider>;
}
export function useApp(){const state=useContext(Context);if(!state)throw new Error('AppProvider is missing.');return state;}
