import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {isPagePath} from './routing.mjs';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2'};
export function staticFiles(directory){
  const root=resolve(directory);
  return async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const send=(status,body,type='text/plain')=>{res.statusCode=status;res.setHeader('Content-Type',type);res.end(req.method==='HEAD'?undefined:body);};
    try{
      let pathname,routePath;try{routePath=new URL(req.url,'http://localhost').pathname;pathname=decodeURIComponent(routePath);}catch{return send(400,'Invalid URL');}
      if(pathname==='/api'||pathname.startsWith('/api/'))return send(404,'Unknown endpoint');
      if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return send(405,'Method not allowed');}
      let file=resolve(root,'.'+pathname);
      if(file!==root&&!file.startsWith(root+sep))return send(403,'Forbidden');
      const page=isPagePath(routePath);
      if(page)file=resolve(root,'index.html');
      else if(pathname.endsWith('/'))file+=sep;
      let content;
      try{content=await readFile(file);}catch(error){
        if(!['ENOENT','ENOTDIR','EISDIR'].includes(error.code))throw error;
        if(page)throw error;
        if(extname(pathname)&&!String(req.headers?.accept||'').includes('text/html'))return send(404,'Not found');
        content=await readFile(resolve(root,'index.html'));
        res.setHeader('Cache-Control','no-cache');return send(404,content,'text/html');
      }
      const extension=extname(file);if(extension==='.html')res.setHeader('Cache-Control','no-cache');
      return send(200,content,types[extension]||'application/octet-stream');
    }catch{return send(500,'Unable to load this page');}
  };
}
