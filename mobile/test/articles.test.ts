import test from 'node:test';
import assert from 'node:assert/strict';
import {articleBlocks,articleChain,assembleArticle,isArticle} from '../src/lib/articles';
import {type Cast} from '../src/lib/model';
import {createApi} from '../src/lib/api';

const root:Cast={hash:'0x'+'11'.repeat(20),signer:'test',data:{fid:1,timestamp:100,castAddBody:{text:'An article',formatVersion:1,chain:{index:0,count:3}}}};
const part=(index:number,timestamp=101,hash='22'):Cast=>({hash:'0x'+hash.repeat(20),signer:'test',data:{fid:1,timestamp,castAddBody:{text:'Part '+index,formatVersion:1,chain:{index,count:3,root:{fid:1,hash:root.hash}}}}});
test('article chains validate identities, boundaries and unknown formats',()=>{
  assert.ok(isArticle(root));assert.equal(isArticle({...root,data:{...root.data,castAddBody:{text:'**plain text**'}}}),false);
  for(const change of [{index:-1},{index:100},{index:1},{count:101},{count:1,index:1},{root:{fid:1,hash:root.hash}}])assert.equal(articleChain({...root,data:{...root.data,castAddBody:{...root.data.castAddBody,chain:{...root.data.castAddBody.chain!,...change}}}}),undefined);
  assert.equal(isArticle({...root,data:{...root.data,castAddBody:{...root.data.castAddBody,formatVersion:999}}}),false);
});
test('chain assembly ignores reply order, selects newest revisions, rejects unrelated casts and reports gaps',()=>{
  const old=part(1),newer=part(1,102,'33'),tie=part(1,102,'44'),last=part(2,101,'55');
  const wrongAuthor={...last,data:{...last.data,fid:2}};
  const wrongCount={...last,data:{...last.data,castAddBody:{...last.data.castAddBody,chain:{...last.data.castAddBody.chain!,count:4}}}};
  const result=assembleArticle(root,[last,old,tie,newer,wrongAuthor,wrongCount]);
  assert.deepEqual(result.parts.map(p=>p.hash),[root.hash,tie.hash,last.hash]);assert.deepEqual(result.missing,[]);
  assert.deepEqual(assembleArticle(root,[old]).missing,[2]);assert.throws(()=>assembleArticle(old,[]),/first part/);
});
test('article parser preserves inline embed order, formatting blocks and literal HTML',()=>{
  const blocks=articleBlocks('## Basics\n- **Bold**\n[$1]\n> A quote\n---\n```js\n<script>literal</script>\n```\n|A|B|\n|-|-|\n|one|two|\n[$2]\n<script>also literal</script>');
  assert.deepEqual(blocks.map(b=>b.kind),['heading','list','embed','quote','divider','code','table','embed','paragraph']);
  assert.equal(blocks[2].index,0);assert.equal(blocks[7].index,1);assert.equal(blocks[5].text,'<script>literal</script>');assert.deepEqual(blocks[6].rows,[['A','B'],['one','two']]);
});
test('article API resolves a continuation to the root and paginates author casts from root timestamp',async()=>{
  const calls:URL[]=[];
  const api=createApi('https://kite.example',async input=>{
    const url=new URL(String(input));calls.push(url);
    if(url.pathname.endsWith('/castById'))return Response.json(root);
    return Response.json(url.searchParams.get('pageToken')?{messages:[part(2)],nextPageToken:''}:{messages:[part(1)],nextPageToken:'next'});
  });
  const result=await api.article(part(1));assert.equal(result.parts.length,3);assert.deepEqual(result.missing,[]);assert.equal(result.searchLimited,false);
  assert.equal(calls[1].searchParams.get('startTimestamp'),'100');assert.equal(calls[2].searchParams.get('pageToken'),'next');
});
