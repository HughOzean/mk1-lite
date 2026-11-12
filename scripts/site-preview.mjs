import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../docs/',import.meta.url));
const index=process.argv.indexOf('--port');const port=Number(index>=0?process.argv[index+1]:process.env.PORT||5180);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
http.createServer(async(request,response)=>{
 if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end('Method not allowed');return}
 try{
  let name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(name.startsWith('/mk1-lite/'))name=name.slice('/mk1-lite'.length);
  if(name==='/')name='/index.html';
  const filename=path.resolve(root,`.${name}`);
  if(!filename.startsWith(root)||!(await stat(filename)).isFile())throw new Error('Not found');
  const data=await readFile(filename);response.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':data.length});response.end(request.method==='HEAD'?undefined:data);
 }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('Not found')}
}).listen(port,'127.0.0.1',()=>console.log(`Mk.1 Lite download preview\nLocal: http://localhost:${port}/`));
