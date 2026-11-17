import {Fragment,type ReactNode} from 'react';
import {Linking,ScrollView,Text,View} from 'react-native';
import {castTextParts} from '../../../src/lib/mentions';
import {articleBlocks,type ArticleBlock} from '../lib/articles';
import {type Cast,castDate,safeLink} from '../lib/model';
import {useApp} from '../lib/state';
import {useQuery} from '../lib/hooks';
import {CastEmbeds,Person} from './CastCard';
import {CastActions} from './CastActions';
import {CastMenu} from './CastMenu';
import {Loading,Notice} from './ui';
import {ThreadConnector} from './ThreadConnector';

function Inline({text,depth=0}:{text:string;depth?:number}){
  const {colors}=useApp();
  if(depth>6)return <>{text}</>;
  const pattern=/\\([\\*_~+\[\]])|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^\n]+?)\*\*|_([^\n]+?)_|~~([^\n]+?)~~|\+\+([^\n]+?)\+\+|`([^`\n]+)`/g;
  const nodes:ReactNode[]=[];let end=0;
  for(const match of text.matchAll(pattern)){
    const index=match.index!;
    // Word-internal underscores are literal, as in repository names.
    if(match[5]&&/[\p{L}\p{N}]/u.test(text[index-1]||'')&&/[\p{L}\p{N}]/u.test(text[index+match[0].length]||''))continue;
    nodes.push(text.slice(end,index));end=index+match[0].length;
    if(match[1])nodes.push(match[1]);
    else if(match[2]){const url=safeLink(match[3]);nodes.push(url?<Text key={index} accessibilityRole="link" style={{color:colors.accent}} onPress={()=>void Linking.openURL(url).catch(()=>{})}><Inline text={match[2]} depth={depth+1}/></Text>:match[2]);}
    else nodes.push(<Text key={index} style={match[4]?{fontWeight:'700'}:match[5]?{fontStyle:'italic'}:match[6]?{textDecorationLine:'line-through'}:match[7]?{textDecorationLine:'underline'}:{fontFamily:'monospace',backgroundColor:colors.soft}}>{match[8]||<Inline text={match[4]||match[5]||match[6]||match[7]} depth={depth+1}/>}</Text>);
  }
  nodes.push(text.slice(end));return <>{nodes}</>;
}
function Block({block}:{block:ArticleBlock}){
  const {colors}=useApp();
  const style={fontSize:17,lineHeight:26,color:colors.ink};
  if(block.kind==='divider')return <View style={{height:1,backgroundColor:colors.line,marginVertical:8}}/>;
  if(block.kind==='table')return <ScrollView horizontal><View>{block.rows?.map((row,index)=><View key={index} style={{flexDirection:'row'}}>{row.map((cell,column)=><View key={column} style={{width:180,padding:10,borderWidth:.5,borderColor:colors.line,backgroundColor:index===0?colors.soft:colors.surface}}><Text selectable style={[style,{fontSize:14,fontWeight:index===0?'600':'400'}]}>{cell}</Text></View>)}</View>)}</View></ScrollView>;
  if(block.kind==='code')return <ScrollView horizontal style={{backgroundColor:colors.soft,borderRadius:10}}><Text selectable style={[style,{fontFamily:'monospace',fontSize:14,padding:12}]}>{block.text}</Text></ScrollView>;
  return <Text selectable style={[style,block.kind==='heading'?{fontSize:block.level===1?26:21,lineHeight:block.level===1?33:29,fontWeight:'700',marginTop:10}:block.kind==='quote'?{borderLeftWidth:3,borderColor:colors.accent,paddingLeft:12,color:colors.muted}:block.kind==='list'?{paddingLeft:(block.level||0)*16}:{}]}><Inline text={block.text}/></Text>;
}
function ArticlePart({cast,first}:{cast:Cast;first:boolean}){
  const {api,colors}=useApp(),body=cast.data.castAddBody;
  const mentions=useQuery(async()=>{
    const labels=new Map<number,string>();
    await Promise.all([...new Set(body.mentions||[])].slice(0,100).map(async fid=>{try{const profile=await api.profile(fid);labels.set(fid,profile.username||String(fid));}catch{labels.set(fid,String(fid));}}));
    return labels;
  },[api,cast.hash]);
  const text=castTextParts(body.text,body.mentions,body.mentionsPositions).parts.map(part=>part.fid!==undefined?`@${mentions.value?.get(part.fid)||part.fid}`:part.text).join('');
  const split=text.indexOf('\n'),title=first?(split<0?text:text.slice(0,split)):'';
  const blocks=body.formatVersion===1?articleBlocks(first?(split<0?'':text.slice(split+1)):text):[{kind:'paragraph' as const,text}];
  const embeds=body.embeds?.length?body.embeds:(body.embedsDeprecated||[]).map(url=>({url}));
  const used=new Set(blocks.filter(block=>block.kind==='embed'&&Number.isInteger(block.index)&&block.index!>=0&&block.index!<embeds.length).map(block=>block.index));
  // The first embed of the root is the cover. Other embeds follow their inline markers.
  const cover=first?embeds[0]:undefined;
  if(cover)used.add(0);
  return <View style={{gap:12}}>
    {first&&<Text selectable accessibilityRole="header" style={{fontSize:30,lineHeight:37,fontWeight:'700',color:colors.ink}}><Inline text={title}/></Text>}
    {cover&&<CastEmbeds embeds={[cover]} visible gutter={0}/>}
    {blocks.map((block,index)=>block.kind==='embed'?embeds[block.index!]?<CastEmbeds key={index} embeds={[embeds[block.index!]]} visible gutter={0}/>:<Text key={index} style={{color:colors.muted}}>Attachment unavailable</Text>:block.kind==='paragraph'&&/^https?:\/\/\S+$/.test(block.text)&&safeLink(block.text)?<CastEmbeds key={index} embeds={[{url:block.text}]} visible gutter={0}/>:<Block key={index} block={block}/>)}
    {embeds.filter((_,index)=>!used.has(index)).map((embed,index)=><CastEmbeds key={`extra:${index}`} embeds={[embed]} visible gutter={0}/>)}
  </View>;
}
export function ArticleReader({cast,threadBefore=false}:{cast:Cast;threadBefore?:boolean}){
  const {api,colors}=useApp();
  const result=useQuery(signal=>api.article(cast,signal),[api,cast.hash,cast.data.fid]);
  if(result.loading)return <Loading/>;
  if(result.error||!result.value)return <Notice title="Article unavailable" retry={result.reload}>{result.error}</Notice>;
  const {root,parts,missing,growing,searchLimited}=result.value;
  return <View style={{padding:16,gap:18,borderBottomWidth:1,borderColor:colors.line}}>
    {threadBefore&&<ThreadConnector before avatarTop={16}/>}
    <View style={{flexDirection:'row',gap:8,alignItems:'center',marginLeft:threadBefore?-2:0}}><Person fid={root.data.fid} dense/><CastMenu cast={root}/></View>
    <Text style={{fontSize:12,color:colors.muted}}>{castDate(root.data.timestamp).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})} · Article</Text>
    {parts.map((part,index)=><Fragment key={part.hash}>{index>0&&part.data.castAddBody.chain!.index!==parts[index-1].data.castAddBody.chain!.index+1&&<Text style={{color:colors.muted}}>Some article content is unavailable.</Text>}<ArticlePart cast={part} first={index===0}/></Fragment>)}
    {!!missing.length&&<Notice title="Article incomplete" retry={result.reload}>{missing.length} part(s) are missing or have been removed.</Notice>}
    {growing&&<Text style={{color:colors.muted}}>This article is still being updated.</Text>}
    {searchLimited&&<Text style={{color:colors.muted}}>Article lookup reached its limit. Some parts or newer revisions may be unavailable.</Text>}
    <CastActions cast={root} conversation/>
  </View>;
}
