import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeCastTime,fullCastTime} from '../src/lib/time';
const timestamp=180000000;
const then=(timestamp+1609459200)*1000;

test('cast time switches from minutes to hours, days, months and years at the expected boundaries',()=>{
 for(const [seconds,label] of [[0,'just now'],[59,'just now'],[60,'1 min ago'],[120,'2 min ago'],[3599,'59 min ago'],[3600,'1 hr ago'],[7200,'2 hr ago'],[86400,'1 day ago'],[2*86400,'2 days ago'],[30*86400,'1 month ago'],[60*86400,'2 months ago'],[365*86400,'1 year ago'],[2*365*86400,'2 years ago']] as const)assert.equal(relativeCastTime(timestamp,then+seconds*1000),label);
 assert.equal(relativeCastTime(timestamp,then-3600000),'just now');
});

test('full cast timestamps include the year and time',()=>{
 const text=fullCastTime(timestamp),date=new Date(then);
 assert.ok(text.includes(String(date.getFullYear())));
 assert.ok(/\d[:.]\d{2}/.test(text));
});
