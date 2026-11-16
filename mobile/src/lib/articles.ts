import {type Cast,isFid,isHash} from './model';

export function articleChain(cast:Cast){
  const chain=cast.data.castAddBody.chain;
  if(!chain||!Number.isInteger(chain.index)||!Number.isInteger(chain.count)||chain.index<0||chain.index>=100||chain.count<0||chain.count>100||chain.count>0&&chain.index>=chain.count)return undefined;
  if(chain.index===0?!!chain.root:!chain.root||chain.root.fid!==cast.data.fid||!isFid(chain.root.fid)||!isHash(chain.root.hash))return undefined;
  return chain;
}
export const isArticle=(cast:Cast)=>cast.data.castAddBody.formatVersion===1&&(!cast.data.castAddBody.chain||!!articleChain(cast));
export function assembleArticle(root:Cast,candidates:Cast[]){
  const chain=articleChain(root);
  if(!isArticle(root)||chain&&chain.index!==0)throw new Error('The article’s first part is unavailable.');
  const parts=new Map<number,Cast>([[0,root]]);
  if(chain)for(const cast of candidates){
    const c=articleChain(cast);
    if(!c||c.index===0||c.count!==chain.count||cast.data.fid!==root.data.fid||c.root?.hash.toLowerCase()!==root.hash.toLowerCase())continue;
    const previous=parts.get(c.index);
    if(!previous||cast.data.timestamp>previous.data.timestamp||cast.data.timestamp===previous.data.timestamp&&cast.hash.toLowerCase()>previous.hash.toLowerCase())parts.set(c.index,cast);
  }
  const count=chain?.count||Math.max(...parts.keys())+1;
  const missing=Array.from({length:count},(_,index)=>index).filter(index=>!parts.has(index));
  return {root,parts:[...parts].sort(([a],[b])=>a-b).map(([,cast])=>cast),missing,growing:chain?.count===0};
}
export type ArticleBlock={kind:'heading'|'paragraph'|'quote'|'list'|'code'|'divider'|'table'|'embed';text:string;level?:number;index?:number;rows?:string[][]};
export function articleBlocks(text:string):ArticleBlock[]{
  const lines=text.replace(/\r\n/g,'\n').split('\n'),blocks:ArticleBlock[]=[];
  for(let i=0;i<lines.length;i++){
    let line=lines[i];
    const fence=/^(`{3,})(.*)$/.exec(line);
    if(fence){const code=[];while(++i<lines.length&&lines[i]!==fence[1])code.push(lines[i]);blocks.push({kind:'code',text:code.join('\n')});continue;}
    while(/(?<!\\)(?:\\\\)*\\$/.test(line)&&i+1<lines.length)line=line.slice(0,-1)+'\n'+lines[++i];
    if(!line.trim())continue;
    const embed=/^\[\$(\d+)\]$/.exec(line.trim());
    if(embed){blocks.push({kind:'embed',text:'',index:Number(embed[1])-1});continue;}
    if(line==='---'){blocks.push({kind:'divider',text:''});continue;}
    const heading=/^(#{1,2}) (.*)$/.exec(line);
    if(heading){blocks.push({kind:'heading',level:heading[1].length,text:heading[2]});continue;}
    if(/^\|.*\|$/.test(line)&&/^\|[\s:|\-]+\|$/.test(lines[i+1]||'')){
      const rows=[line];i++;while(i+1<lines.length&&/^\|.*\|$/.test(lines[i+1]))rows.push(lines[++i]);
      blocks.push({kind:'table',text:'',rows:rows.map(row=>row.slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\([|\\-])/g,'$1')))});continue;
    }
    if(line.startsWith('> ')){blocks.push({kind:'quote',text:line.slice(2)});continue;}
    const list=/^( *)(- |\d+\. )(.*)$/.exec(line);
    if(list){blocks.push({kind:'list',level:Math.min(6,Math.floor(list[1].length/2)),text:(list[2]==='- '?'• ':list[2])+list[3]});continue;}
    blocks.push({kind:'paragraph',text:line});
  }
  return blocks;
}
