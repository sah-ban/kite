import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {useColorScheme} from 'react-native';
import {createApi, type Api} from './api';
import {normalizeServer} from './model';

export type ThemeMode = 'system'|'light'|'dark';
const palettes = {
  light: {background:'#fafaf9',surface:'#ffffff',soft:'#f0f0ed',ink:'#18221e',muted:'#737b75',line:'#e4e7e1',accent:'#326d49',accentSoft:'#e9f1e7',danger:'#b33a32'},
  dark: {background:'#111714',surface:'#18201c',soft:'#212c25',ink:'#eef2eb',muted:'#a0ada3',line:'#303d34',accent:'#a5d6a4',accentSoft:'#273c2b',danger:'#ffaaa0'},
};
export type Colors = typeof palettes.light;
type State = {api:Api;theme:ThemeMode;dark:boolean;colors:Colors;ready:boolean;setTheme:(value:ThemeMode)=>Promise<void>};
const Context = createContext<State|null>(null);
const SETTINGS = 'kite.mobile.settings.v1';
const defaultServer = normalizeServer(Constants.expoConfig?.extra?.apiUrl || 'https://kite.sahban.dev');
export function AppProvider({children}:{children:ReactNode}) {
  const system = useColorScheme();
  const [theme,changeTheme] = useState<ThemeMode>('system'), [ready,setReady] = useState(false);
  useEffect(()=>{
    let active=true;
    AsyncStorage.getItem(SETTINGS).then(value=>{
      if(!value||!active)return;
      const saved=JSON.parse(value);
      if(['system','light','dark'].includes(saved.theme))changeTheme(saved.theme);
    }).catch(()=>{/* Defaults remain usable if storage is unavailable. */}).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;};
  },[]);
  const api=useMemo(()=>createApi(defaultServer),[]);
  const dark=theme==='dark'||(theme==='system'&&system==='dark');
  async function setTheme(value:ThemeMode){await AsyncStorage.setItem(SETTINGS,JSON.stringify({theme:value}));changeTheme(value);}
  return <Context.Provider value={{api,theme,dark,colors:palettes[dark?'dark':'light'],ready,setTheme}}>{children}</Context.Provider>;
}
export function useApp(){const state=useContext(Context);if(!state)throw new Error('AppProvider is missing.');return state;}
