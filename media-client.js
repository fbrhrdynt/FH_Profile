'use strict';
const crypto=require('node:crypto');
const allowed=new Set(['project','certification','post','experience','education','tool']);
const roles=new Set(['cover','gallery','document','certificate','attachment']);
function settings(){
 const token=process.env.FEBRO_PROFILE_SERVICE_TOKEN||'';
 if(token.length<48)throw Error('Media integration not configured');
 const base=new URL(process.env.FEBRO_FILES_API_URL||'http://127.0.0.1:3480').origin;
 return {token,base};
}
async function remote(method,route,body){
 const {token,base}=settings();
 const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/octet-stream','Content-Length':String(body.length)}:{})},body,signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error('Storage error '+r.status);
 return r;
}
function fileMime(name,data){
 const ext=name.toLowerCase().split('.').pop();
 if(ext==='pdf'&&data.toString('ascii',0,5)==='%PDF-')return 'application/pdf';
 if(ext==='png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(['jpg','jpeg'].includes(ext)&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
 if(ext==='webp'&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
async function upload(req,kind,id,role,name){
 if(!allowed.has(kind)||!roles.has(role)||!Number.isSafeInteger(id)||id<1||typeof name!=='string'||!name||name.length>150||name.includes('/')||name.includes('\\'))throw Error('Invalid media metadata');
 const chunks=[];let size=0,max=['cover','gallery'].includes(role)?5e6:20e6;
 for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('File too large');chunks.push(chunk);}
 const data=Buffer.concat(chunks),mime=fileMime(name,data);
 if(!mime||(['cover','gallery'].includes(role)&&!mime.startsWith('image/')))throw Error('Unsupported file type');
 const route='/api/integrations/v1/files?'+new URLSearchParams({kind,entry:String(id),name:crypto.randomUUID()+'-'+name});
 const result=await (await remote('POST',route,data)).json();
 if(!result.item?.id)throw Error('Invalid storage response');
 return {remoteId:result.item.id,name,mime,size,sha256:crypto.createHash('sha256').update(data).digest('hex')};
}
module.exports={upload,remote,roles};
