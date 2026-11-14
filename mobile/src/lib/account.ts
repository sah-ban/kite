import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {createAccount} from './account-core';
import type {Api} from './api';

const KEY='kite.account.v1';
const options={keychainService:'dev.sahban.kite.signer',keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export function deviceAccount(api:Api){
  return createAccount(api,{
    get:async()=>await SecureStore.isAvailableAsync()?SecureStore.getItemAsync(KEY,options):null,
    set:async value=>{if(!await SecureStore.isAvailableAsync())throw new Error('Sign-in is available in the Android app. Open Kite in Expo Go or the installed app.');await SecureStore.setItemAsync(KEY,value,options);},
    remove:async()=>{if(await SecureStore.isAvailableAsync())await SecureStore.deleteItemAsync(KEY,options);},
  },async size=>{if(!await SecureStore.isAvailableAsync())throw new Error('Sign-in is available in the Android app. Open Kite in Expo Go or the installed app.');return Crypto.getRandomBytesAsync(size);});
}
