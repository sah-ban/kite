import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {installRandomValues} from '../src/lib/install-crypto';

test('Farcaster cold-starts in a native-like runtime after secure randomness is initialized',async()=>{
  const sdk=createRequire(resolve('package.json')).resolve('@farcaster/core').replace(/\.js$/,'.mjs');
  const result=await build({entryPoints:[sdk],bundle:true,platform:'browser',conditions:['react-native','browser'],format:'iife',globalName:'Farcaster',target:'es2022',write:false,logLevel:'silent'});
  const source=result.outputFiles[0].text;
  const runtime=()=>({TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,ArrayBuffer,DataView,setTimeout,clearTimeout});
  assert.throws(()=>runInNewContext(source,runtime(),{timeout:10000}),/crypto.getRandomValues must be defined/);
  const native=runtime();
  installRandomValues(native as typeof native&{crypto?:object},webcrypto.getRandomValues.bind(webcrypto));
  runInNewContext(source,native,{timeout:10000});
  assert.equal(runInNewContext('typeof Farcaster.makeReactionAdd',native),'function');
});

test('crypto initialization preserves an existing provider and unrelated crypto APIs',()=>{
  const existing=()=>new Uint8Array(),subtle={};const scope={crypto:{getRandomValues:existing,subtle}};
  installRandomValues(scope,()=>{throw Error('Must not replace native crypto');});assert.equal(scope.crypto.getRandomValues,existing);assert.equal(scope.crypto.subtle,subtle);
  const partial:{crypto:{subtle:object;getRandomValues?:unknown}}={crypto:{subtle}};const fill=webcrypto.getRandomValues.bind(webcrypto);installRandomValues(partial,fill);assert.equal(partial.crypto.getRandomValues,fill);assert.equal(partial.crypto.subtle,subtle);
});
