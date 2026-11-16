import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import {router,useRootNavigationState} from 'expo-router';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState,Linking,Platform} from 'react-native';
import type * as Notifications from 'expo-notifications';
import {pushRoute} from './push-routing';
import {useApp} from './state';

type PushState={supported:boolean;busy:boolean;enabled:boolean;error:string;enable:()=>void;disable:()=>void;openSettings:()=>void};
const Context=createContext<PushState|null>(null);
const supported=Platform.OS==='android'&&Constants.executionEnvironment!=='storeClient';
let notifications:Promise<typeof Notifications>|undefined;
const loadNotifications=()=>notifications||=import('expo-notifications');
const INSTALLATION='kite.mobile.push.installation.v1';
let installation:Promise<string>|undefined;
function installationId(){return installation||=(async()=>{
  const saved=await AsyncStorage.getItem(INSTALLATION);if(saved&&/^[a-f0-9]{32}$/.test(saved))return saved;
  const value=Crypto.randomUUID().replace(/-/g,'');await AsyncStorage.setItem(INSTALLATION,value);return value;
})().catch(error=>{installation=undefined;throw error;});}
export function PushProvider({children}:{children:ReactNode}){
  const {account,ready,getPush,setPush,api}=useApp(),fid=account.session?.fid;
  const nav=useRootNavigationState();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[permission,setPermission]=useState(true);
  const current=useRef(fid),lock=useRef(false);
  useEffect(()=>{current.current=fid;},[fid]);
  const enabled=!!account.pushEnabled&&permission;
  const sync=useCallback(async(prompt:boolean)=>{
    if(!supported||!fid||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const n=await loadNotifications();
      const previous=await getPush();
      if(!prompt&&!previous?.enabled)return;
      await n.setNotificationChannelAsync('activity',{name:'Activity',importance:n.AndroidImportance.HIGH,sound:'default'});
      let status=await n.getPermissionsAsync();
      if(prompt&&!status.granted&&status.canAskAgain)status=await n.requestPermissionsAsync();
      if(current.current!==fid)return;
      setPermission(status.granted);
      if(!status.granted){
        if(previous?.enabled)await setPush({...previous,enabled:false});
        if(prompt)throw new Error('Allow notifications in your phone settings to receive activity alerts.');
        return;
      }
      const config=await api.config();
      if(!config.indexedFeedEnabled)throw new Error('Push notifications are unavailable right now. Please try again later.');
      const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
      if(!projectId)throw new Error('Push notifications aren’t available in this app version. Please update Kite.');
      const token=(await n.getExpoPushTokenAsync({projectId})).data;
      const id=await installationId();
      if(current.current===fid)await setPush({installationId:id,token,enabled:true});
    }catch(error){if(current.current===fid)setError(error instanceof Error?(/Firebase|native module|ExpoPushTokenManager|ExpoNotifications/i.test(error.message)?'Push notifications aren’t available in this app version. Please update Kite.':error.message):'Could not enable notifications. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  },[api,fid,getPush,setPush]);
  useEffect(()=>{
    if(!supported||!ready||!fid)return;
    let active=true,subscription:ReturnType<typeof Notifications.addPushTokenListener>|undefined;
    void loadNotifications().then(n=>{if(!active)return;subscription=n.addPushTokenListener(()=>void sync(false));}).catch(()=>{/* The enable button reports unavailable native support. */});
    // Registration reconciles device permissions and its backend token after account restore.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync(false);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')void sync(false);});
    return()=>{active=false;subscription?.remove();listener.remove();};
  },[ready,fid,sync]);
  useEffect(()=>{
    if(!supported||!ready||!nav?.key)return;
    let active=true,subscription:ReturnType<typeof Notifications.addNotificationResponseReceivedListener>|undefined;
    void loadNotifications().then(n=>{
      if(!active)return;
      n.setNotificationHandler({handleNotification:async notification=>{
        const show=!!pushRoute(notification.request.content.data,current.current);
        return {shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
      }});
      function open(response:Notifications.NotificationResponse){
        if(!active||response.actionIdentifier!==n.DEFAULT_ACTION_IDENTIFIER)return;
        const route=pushRoute(response.notification.request.content.data,current.current);
        n.clearLastNotificationResponse();if(route)router.push(route);
      }
      subscription=n.addNotificationResponseReceivedListener(open);
      const response=n.getLastNotificationResponse();if(response)open(response);
    }).catch(()=>{/* Existing builds can continue without the new native module. */});
    return()=>{active=false;subscription?.remove();};
  },[ready,nav?.key]);
  async function disable(){
    if(lock.current||!fid)return;lock.current=true;setBusy(true);setError('');
    try{const previous=await getPush();if(previous)await setPush({...previous,enabled:false});const n=await loadNotifications();await n.dismissAllNotificationsAsync();}
    catch(error){setError(error instanceof Error?error.message:'Could not disable notifications. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <Context.Provider value={{supported,busy,enabled,error,enable:()=>void sync(true),disable:()=>void disable(),openSettings:()=>{void Linking.openSettings().catch(()=>setError('Could not open phone settings.'));}}}>{children}</Context.Provider>;
}
export function usePush(){const state=useContext(Context);if(!state)throw new Error('PushProvider is missing.');return state;}
