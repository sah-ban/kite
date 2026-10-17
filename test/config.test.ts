import test from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, hub, localOrigin } from '../src/lib/hub';

test('a browser on the server IP reads through the gateway and cannot import an account',async()=>{
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'window',{value:{location:{hostname:'192.0.2.10',origin:'http://192.0.2.10:5173'}},configurable:true});
  const calls:string[]=[];
  globalThis.fetch=async input=>{
    calls.push(String(input));
    return String(input)==='/api/config'
      ? Response.json({readUrl:'/api/read',validatorUrl:'',optimismRpcUrl:'https://rpc.example'})
      : Response.json({messages:[]});
  };
  try{
    const config=await getConfig();
    assert.equal(config.readUrl,'http://192.0.2.10:5173/api/read');
    assert.equal(localOrigin(),false);
    await hub(config,'castsByFid',{fid:37});
    assert.deepEqual(calls,['/api/config','/api/read/v1/castsByFid?fid=37']);
  }finally{globalThis.fetch=originalFetch;}
});
