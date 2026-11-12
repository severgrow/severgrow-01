import {createServer} from 'node:http';
import {existsSync,readFileSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import type {AddressInfo} from 'node:net';
/** Serve the same built product at its real route boundaries, with no remote service. */
export const productFixture=async(options:{offlineApiPort?:number}={})=>{
  const root=resolve(process.env.FUTA_DIST??'web/dist');
  const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
    '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
  let documents:Promise<void>|null=null;
  const server=createServer((req,res)=>{
    const path=new URL(req.url??'/', 'http://local').pathname.replace(/^\/(test|2|3)\//,'/');
    let file=resolve(root,`.${path}`);
    if(!file.startsWith(root+sep)&&file!==root){res.writeHead(400);res.end();return;}
    if(file===root||!existsSync(file)||path.endsWith('/'))file=resolve(root,'index.html');
    const send=()=>{res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'});res.end(readFileSync(file));};
    if(extname(file)==='.html'&&documents)void documents.then(send);else send();
  });
  // Real HTTP, not browser interception: WebKit must receive a valid preflight response even
  // when the application is deliberately offline. This server stores nothing and always fails API calls.
  const offline=options.offlineApiPort?createServer((req,res)=>{
    res.writeHead(req.method==='OPTIONS'?204:503,{
      'content-type':'application/json','access-control-allow-origin':req.headers.origin??'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':req.headers['access-control-request-headers']??'authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version',
    });res.end(req.method==='OPTIONS'?'':'{"error":"test backend unavailable"}');
  }):null;
  if(offline)await new Promise<void>((r,j)=>{offline.once('error',j);offline.listen(options.offlineApiPort,'127.0.0.1',r);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const shut=(s:typeof server)=>new Promise<void>((r,j)=>s.close(e=>e?j(e):r()));
  return {origin:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    pauseDocuments(){let resume!:()=>void;documents=new Promise<void>(r=>{resume=r;});return()=>{documents=null;resume();};},
    close:async()=>{await Promise.all([shut(server),...(offline?[shut(offline)]:[])]);}};
};
