import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedNotifications,markNotificationsSeen,notificationsSeen} from '../src/lib/indexed-notifications';

test('notification read markers are monotonic, per account, and work with unavailable storage',()=>{
 const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),win=Object.getOwnPropertyDescriptor(globalThis,'window');
 const values=new Map<string,string>(),events=new EventTarget();let changes=0;
 events.addEventListener('kite:notifications-read',()=>changes++);
 Object.defineProperty(globalThis,'window',{configurable:true,value:events});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)}});
 try{
  values.set('kite:notifications:seen:70001','invalid');assert.equal(notificationsSeen(70001),'1970-01-01T00:00:00.000Z');
  markNotificationsSeen(70001,'2026-10-20T10:00:00.000Z');markNotificationsSeen(70001,'2026-10-19T10:00:00.000Z');
  assert.equal(notificationsSeen(70001),'2026-10-20T10:00:00.000Z');assert.equal(notificationsSeen(70002),'1970-01-01T00:00:00.000Z');
  values.set('kite:notifications:seen:70001','2026-10-21T10:00:00.000Z');assert.equal(notificationsSeen(70001),'2026-10-21T10:00:00.000Z');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage disabled');}});
  markNotificationsSeen(70003,'2026-10-20T11:00:00.000Z');assert.equal(notificationsSeen(70003),'2026-10-20T11:00:00.000Z');
  assert.equal(changes,3);
 }finally{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete (globalThis as any).localStorage;if(win)Object.defineProperty(globalThis,'window',win);else delete (globalThis as any).window;}
});

test('indexed notification reader uses database API, forwards cursor/filter and reports failures',async()=>{
 const original=globalThis.fetch;let requested='';
 globalThis.fetch=async(input)=>{requested=String(input);return Response.json({items:[],nextPageToken:'',unread:0});};
 try{
  await indexedNotifications(37,{kind:'like',cursor:'123'});const url=new URL(requested,'https://test.example');
  assert.equal(url.pathname,'/api/feed/notifications');assert.equal(url.searchParams.get('fid'),'37');assert.equal(url.searchParams.get('kind'),'like');assert.equal(url.searchParams.get('cursor'),'123');
  globalThis.fetch=async()=>Response.json({error:'Notifications unavailable'},{status:503});
  await assert.rejects(indexedNotifications(37),/Notifications unavailable/);
 }finally{globalThis.fetch=original;}
});
