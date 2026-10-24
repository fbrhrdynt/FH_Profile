'use strict';
// CMS remains the authority. This bridge never returns storage IDs, access tokens or IP hashes.
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const PREFIX='/api/integrations/one/v1';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function signature(key,timestamp,nonce,method,path,body=''){return crypto.createHmac('sha256',key).update([timestamp,nonce,method,path,body].join('\n')).digest('hex');}
function equal(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function setup({db,accessHandler,cvAction}){
 db.exec(`CREATE TABLE IF NOT EXISTS one_integration_nonces(nonce TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS one_integration_actions(key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS one_integration_audit(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,request_id INTEGER NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS one_integration_outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,request_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,delivered_at TEXT,last_error TEXT);
 CREATE TRIGGER IF NOT EXISTS one_document_event AFTER INSERT ON access_requests BEGIN INSERT OR IGNORE INTO one_integration_outbox(id,kind,request_id) VALUES('cms:document:'||NEW.id||':created','document',NEW.id); END;
 CREATE TRIGGER IF NOT EXISTS one_cv_event AFTER INSERT ON cv_requests BEGIN INSERT OR IGNORE INTO one_integration_outbox(id,kind,request_id) VALUES('cms:cv:'||NEW.id||':created','cv',NEW.id); END;
 CREATE TRIGGER IF NOT EXISTS one_contact_event AFTER INSERT ON contact_messages BEGIN INSERT OR IGNORE INTO one_integration_outbox(id,kind,request_id) VALUES('cms:contact:'||NEW.id||':created','contact',NEW.id); END;`);
 const audit=(kind,id,actor,event)=>db.prepare('INSERT INTO one_integration_audit(kind,request_id,actor,event) VALUES(?,?,?,?)').run(kind,id,actor,event);
 const table={document:'access_requests',cv:'cv_requests',contact:'contact_messages'};
 const raw=(kind,id)=>db.prepare(`SELECT * FROM ${table[kind]} WHERE id=?`).get(id);
 function item(kind,r,detail=false){
  let status=kind==='document'?r.status:kind==='cv'?r.review_status:r.is_read?'read':'unread';
  const expires=r.expires_at||r.token_expires_at||0;if(expires&&expires<=Date.now()&&['approved','partial'].includes(status))status='expired';
  const x={kind,id:r.id,name:r.name,email:r.email,phone:r.phone||'',message:r.message||'',reason:r.reason||'',company:r.company||'',status,createdAt:r.created_at,expiresAt:r.expires_at||r.token_expires_at||0,deliveryStatus:r.delivery||r.delivery_status,isRead:!!r.is_read};
  if(detail){
   x.capabilities=kind==='contact'?[r.is_read?'unread':'read']:kind==='document'?(status==='email_pending'?[]:['approve','partial',...(['pending','email_failed'].includes(status)?['reject']:[]),...(['approved','partial'].includes(status)?['revoke']:[])]):(['pending','email_failed','revoked','expired'].includes(status)?['approve',...(['pending','email_failed'].includes(status)?['reject']:[])]:status==='approved'?['revoke']:[]);
   x.history=db.prepare('SELECT id,actor,event,created_at AS createdAt FROM one_integration_audit WHERE kind=? AND request_id=? ORDER BY id').all(kind,r.id);
   if(kind==='document'){
    x.files=db.prepare('SELECT f.id,f.original_name AS name,e.title,i.approved,f.allow_preview AS preview,f.allow_download AS download FROM access_items i JOIN entry_files f ON f.id=i.file_id JOIN entries e ON e.id=f.entry_id WHERE i.request_id=? ORDER BY f.sort_order,f.id').all(r.id);
    x.history=[...db.prepare('SELECT id,actor,event,created_at AS createdAt FROM access_history WHERE request_id=? ORDER BY id').all(r.id),...x.history];
   }
  }
  return x;
 }
 function totals(){return {document:db.prepare('SELECT count(*) n FROM access_requests').get().n,cv:db.prepare('SELECT count(*) n FROM cv_requests').get().n,contact:db.prepare('SELECT count(*) n FROM contact_messages').get().n,pending:db.prepare("SELECT (SELECT count(*) FROM access_requests WHERE status IN ('pending','email_failed'))+(SELECT count(*) FROM cv_requests WHERE review_status IN ('pending','email_failed')) n").get().n,unread:db.prepare('SELECT count(*) n FROM contact_messages WHERE is_read=0').get().n};}
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function body(req){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>16384)throw Error('Payload too large');}return s;}
 function capture(){return {statusCode:200,headers:{},writeHead(code,h){this.statusCode=code;Object.assign(this.headers,h);},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(text){this.text=String(text||'');}};}
 async function handler(req,res,url){
  if(url.pathname==='/api/integrations/files/v1/grant'){
   const secret=process.env.FILES_CMS_SERVICE_TOKEN;
   if(req.method!=='POST'||!secret||secret.length<32||!equal(req.headers.authorization,'Bearer '+secret)||req.headers.origin)return reply(res,401,{error:'Unauthorized'});
   let p;try{p=JSON.parse(await body(req));}catch{return reply(res,400,{error:'Invalid payload'});}
   if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(p.tokenHash))return reply(res,400,{error:'Invalid token hash'});
   const r=db.prepare("SELECT id,expires_at FROM access_requests WHERE token_hash=? AND status IN ('approved','partial') AND expires_at>?").get(p.tokenHash,Date.now());
   if(!r)return reply(res,410,{error:'Access expired or revoked'});
   const files=db.prepare('SELECT f.id,f.remote_id,f.original_name,f.caption,f.requestable,f.allow_preview,f.allow_download,i.grant_preview,i.grant_download FROM access_items i JOIN entry_files f ON f.id=i.file_id JOIN entries e ON e.id=f.entry_id WHERE i.request_id=? AND i.approved=1 AND e.enabled=1 AND f.requestable=1 ORDER BY f.sort_order,f.id').all(r.id).map(f=>({id:f.id,remoteId:f.remote_id,name:f.original_name,caption:f.caption,preview:!!f.grant_preview&&!!(f.allow_preview||f.allow_download||f.requestable),download:!!f.grant_download&&!!f.allow_download}));
   return reply(res,200,{id:r.id,expiresAt:r.expires_at,files});
  }
  if(!url.pathname.startsWith(PREFIX))return false;
  const key=process.env.FEBRO_ONE_CMS_SECRET;
  const timestamp=String(req.headers['x-febro-timestamp']||''),nonce=String(req.headers['x-febro-nonce']||'');
  if(!key||key.length<32||req.headers.origin||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce))return reply(res,401,{error:'Unauthorized'});
  let text;try{text=await body(req);}catch{return reply(res,413,{error:'Payload too large'});}
  if(!equal(req.headers['x-febro-signature'],signature(key,timestamp,nonce,req.method,url.pathname+url.search,text)))return reply(res,401,{error:'Unauthorized'});
  db.prepare('DELETE FROM one_integration_nonces WHERE expires_at<?').run(Date.now());
  try{db.prepare('INSERT INTO one_integration_nonces VALUES(?,?)').run(nonce,Date.now()+600000);}catch{return reply(res,409,{error:'Replay rejected'});}
  const route=url.pathname.slice(PREFIX.length);
  if(req.method==='GET'&&route==='/overview')return reply(res,200,{totals:totals()});
  if(req.method==='GET'&&route==='/inbox'){
   const kind=url.searchParams.get('kind'),limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||100)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
   if(kind&&!Object.hasOwn(table,kind))return reply(res,400,{error:'Invalid kind'});
   if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)||offset>1000000)return reply(res,400,{error:'Invalid pagination'});
   const wanted=url.searchParams.get('status');
   if(wanted&&!['pending','approved','partial','rejected','revoked','expired','email_failed','email_pending','read','unread'].includes(wanted))return reply(res,400,{error:'Invalid status'});
   const items=(kind?[kind]:Object.keys(table)).flatMap(k=>{
    const expr=k==='contact'?"CASE WHEN is_read=1 THEN 'read' ELSE 'unread' END":k==='document'?"CASE WHEN status IN ('approved','partial') AND expires_at>0 AND expires_at<=? THEN 'expired' ELSE status END":"CASE WHEN review_status='approved' AND token_expires_at>0 AND token_expires_at<=? THEN 'expired' ELSE review_status END";
    const args=wanted?[...(k==='contact'?[]:[Date.now()]),wanted,limit+offset]:[limit+offset];
    return db.prepare(`SELECT * FROM ${table[k]} ${wanted?'WHERE ('+expr+')=?':''} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...args).map(r=>item(k,r));
   }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id).slice(offset,offset+limit);
   return reply(res,200,{items,totals:totals(),limit,offset});
  }
  const m=route.match(/^\/(document|cv|contact)\/([1-9]\d*)(\/decision)?$/);
  if(!m)return reply(res,404,{error:'Not found'});
  const [,kind,idText,decision]=m,id=Number(idText);if(!Number.isSafeInteger(id))return reply(res,400,{error:'Invalid ID'});const r=raw(kind,id);if(!r)return reply(res,404,{error:'Request not found'});
  if(req.method==='GET'&&!decision)return reply(res,200,{item:item(kind,r,true)});
  if(req.method!=='POST'||!decision)return reply(res,405,{error:'Method not allowed'});
  let p;try{p=JSON.parse(text);}catch{return reply(res,400,{error:'Invalid JSON'});}
  if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.actor!=='string'||p.actor.length<1||p.actor.length>200||typeof p.idempotencyKey!=='string'||!/^[a-zA-Z0-9:_-]{16,128}$/.test(p.idempotencyKey)||typeof p.expectedStatus!=='string')return reply(res,400,{error:'Invalid action metadata'});
  const fingerprint=digest(JSON.stringify({kind,id,...p})),previous=db.prepare('SELECT * FROM one_integration_actions WHERE key=?').get(p.idempotencyKey);
  if(previous)return previous.fingerprint!==fingerprint?reply(res,409,{error:'Idempotency key reused'}):previous.result?reply(res,JSON.parse(previous.result).status,JSON.parse(previous.result).data):reply(res,409,{error:'Decision in progress or interrupted; inspect request before retry'});
  if(item(kind,r).status!==p.expectedStatus)return reply(res,409,{error:'Request changed; refresh before reviewing'});
  if(!item(kind,r,true).capabilities.includes(p.action))return reply(res,409,{error:'Action unavailable for current status'});
  if(kind==='document'&&['approve','partial'].includes(p.action)){
   if(!Number.isInteger(p.hours??72)||(p.hours??72)<1||(p.hours??72)>2160)return reply(res,400,{error:'Duration must be 1–2160 hours'});
   if(p.action==='partial'&&(!Array.isArray(p.fileIds)||!p.fileIds.length||p.fileIds.length>100||p.fileIds.some(n=>!Number.isSafeInteger(n)||!item(kind,r,true).files.some(f=>f.id===n))))return reply(res,400,{error:'Invalid selected files'});
  }
  // Persist before SMTP: retries after an uncertain response can never send a second approval.
  db.prepare('INSERT INTO one_integration_actions(key,fingerprint) VALUES(?,?)').run(p.idempotencyKey,fingerprint);
  audit(kind,id,p.actor,'decision started: '+p.action);
  let status=200,data;
  try{
   if(kind==='contact')db.prepare('UPDATE contact_messages SET is_read=? WHERE id=?').run(p.action==='read'?1:0,id);
   else{
    const response=capture();
    if(kind==='cv')await cvAction(response,id,p.action);
    else{
     const params=new URLSearchParams({_csrf:'internal-bridge',hours:String(p.hours??72)});for(const fileId of p.fileIds||[])params.set('file_'+fileId,'1');
     const request=Readable.from([Buffer.from(params.toString())]);request.method='POST';request.headers={'content-type':'application/x-www-form-urlencoded'};
     await accessHandler(request,response,new URL('http://localhost/admin/access-requests/'+id+'/'+p.action),{email:p.actor,csrf:'internal-bridge'});
    }
    const location=response.headers.Location||response.headers.location||'';
    if(response.statusCode>=400||/result=(smtp_missing|cv_missing|email_failed)/.test(location)){status=response.statusCode>=400?response.statusCode:502;data={error:/smtp_missing/.test(location)?'SMTP is not configured':/cv_missing/.test(location)?'CV storage unavailable':'Decision could not complete; inspect current status',item:item(kind,raw(kind,id),true)};}
   }
   data??={ok:true,item:item(kind,raw(kind,id),true)};
  }catch(error){status=500;data={error:'Decision interrupted; inspect request before retry'};}
  audit(kind,id,p.actor,p.action+(status===200?' completed':' failed'));
  db.prepare('UPDATE one_integration_actions SET result=? WHERE key=?').run(JSON.stringify({status,data}),p.idempotencyKey);
  return reply(res,status,data);
 }
 let delivering=false;
 async function deliver(){
  const key=process.env.FEBRO_ONE_CMS_SECRET,endpoint=process.env.FEBRO_ONE_EVENTS_URL;
  if(delivering||!key||key.length<32||!endpoint)return;
  let target;try{target=new URL(endpoint);if(target.username||target.password||!(target.protocol==='https:'||(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname))))return;}catch{return;}
  delivering=true;try{for(const row of db.prepare('SELECT * FROM one_integration_outbox WHERE delivered_at IS NULL AND next_attempt<=? ORDER BY created_at LIMIT 20').all(Date.now())){
   const event=JSON.stringify({id:row.id,kind:row.kind,requestId:row.request_id,event:'created',createdAt:row.created_at}),timestamp=String(Date.now()),nonce=crypto.randomBytes(24).toString('hex');
   try{const response=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-febro-timestamp':timestamp,'x-febro-nonce':nonce,'x-febro-signature':signature(key,timestamp,nonce,'POST',target.pathname+target.search,event)},body:event});if(!response.ok)throw Error('HTTP '+response.status);db.prepare('UPDATE one_integration_outbox SET delivered_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?').run(row.id);}catch(error){db.prepare('UPDATE one_integration_outbox SET attempts=attempts+1,next_attempt=?,last_error=? WHERE id=?').run(Date.now()+Math.min(3600000,1000*2**Math.min(row.attempts,12)),String(error.message).slice(0,100),row.id);}
  }}finally{delivering=false;}
 }
 const timer=setInterval(()=>deliver().catch(()=>{}),5000);timer.unref();
 return {handler,deliver,item,totals};
}
module.exports={setup,signature};
