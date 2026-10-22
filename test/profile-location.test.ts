import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateLabel, geoCoordinates } from '../src/lib/location';
// @ts-expect-error Shared Node middleware.
import { profileLocations, resolveLocation } from '../profile-location.mjs';

async function call(middleware:ReturnType<typeof profileLocations>,query='lat=51.17&lon=71.43',method='GET') {
  let status=200,body='';
  const response={get statusCode(){return status;},set statusCode(value){status=value;},setHeader(){},end(value:string){body=value;}};
  await middleware({url:'/api/profile/location?'+query,method},response,()=>{throw new Error('Unexpected route');});
  return {status,body:JSON.parse(body)};
}

test('geo locations validate axes, preserve signs, and leave plain text alone',()=>{
  assert.deepEqual(geoCoordinates('geo:51.17,71.43'),{lat:51.17,lon:71.43});
  assert.deepEqual(geoCoordinates(' GEO:-33.86,151.21,10;u=20 '),{lat:-33.86,lon:151.21});
  assert.deepEqual(geoCoordinates('geo:0,0'),{lat:0,lon:0});
  assert.equal(coordinateLabel({lat:51.17,lon:71.43}),'51.17° N, 71.43° E');
  assert.equal(coordinateLabel({lat:-33.86,lon:-151.21}),'33.86° S, 151.21° W');
  for(const value of ['Astana, Kazakhstan','geo:91,71','geo:51,181','geo:NaN,1','geo:,','geo:1,2/evil','https://example.com','geo:1e2,0'])assert.equal(geoCoordinates(value),undefined);
});

test('profile locations resolve from bundled city data without any external requests',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Location lookup must stay offline');};
  try{
    const middleware=profileLocations();
    assert.deepEqual(await call(middleware),{status:200,body:{label:'Astana, Kazakhstan'}});
    assert.deepEqual(await call(middleware,'lat=51.171&lon=71.431'),{status:200,body:{label:'Astana, Kazakhstan'}});
    assert.match((await call(middleware,'lat=-33.86&lon=151.21')).body.label,/Australia$/);
    assert.deepEqual(await call(middleware,'lat=0&lon=0'),{status:200,body:{label:null}});
    assert.deepEqual(await call(middleware),{status:200,body:{label:'Astana, Kazakhstan'}});
  }finally{globalThis.fetch=original;}
});

test('nearest-city lookup handles the antimeridian, distance limits and approximate labels',()=>{
  const places=[[0,-179.99,'Test city','FJ']];
  assert.deepEqual(resolveLocation(0,179.99,places),{label:'Test city, Fiji'});
  assert.deepEqual(resolveLocation(0,179.9,places),{label:'Near Test city, Fiji'});
  assert.deepEqual(resolveLocation(0,179,places),{label:null});
  assert.deepEqual(resolveLocation(0,0,[]),{label:null});
});

test('invalid coordinates and methods are rejected; unrelated routes pass through',async()=>{
  const middleware=profileLocations();
  for(const query of ['','lat=&lon=1','lat=NaN&lon=1','lat=91&lon=1','lat=1&lon=-181','lat=0x10&lon=0','lat=1e2&lon=0'])assert.equal((await call(middleware,query)).status,400);
  assert.equal((await call(middleware,'lat=51.17&lon=71.43','POST')).status,405);
  let next=false;middleware({url:'/other',method:'GET'},{},()=>{next=true;});assert.ok(next);
});
