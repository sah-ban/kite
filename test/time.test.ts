import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeCastTime,fullCastTime} from '../src/lib/time';
const timestamp=180000000;
const then=(timestamp+1609459200)*1000;

test('cast time switches from minutes to hours, days, months and years at the expected boundaries',()=>{
 for(const [seconds,label] of [[0,'now'],[59,'now'],[60,'1m'],[120,'2m'],[3599,'59m'],[3600,'1h'],[7200,'2h'],[86400,'1d'],[2*86400,'2d'],[30*86400,'1mo'],[60*86400,'2mo'],[365*86400,'1y'],[2*365*86400,'2y']] as const)assert.equal(relativeCastTime(timestamp,then+seconds*1000),label);
 assert.equal(relativeCastTime(timestamp,then-3600000),'now');
});

test('full cast timestamps include the year and time',()=>{
 const text=fullCastTime(timestamp),date=new Date(then);
 assert.ok(text.includes(String(date.getFullYear())));
 assert.ok(/\d[:.]\d{2}/.test(text));
});
