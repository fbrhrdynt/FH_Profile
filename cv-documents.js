'use strict';
const crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const {remote}=require('./media-client');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function config(db){db.prepare('INSERT OR IGNORE INTO cv_configuration(id,approval_hours) VALUES(1,?)').run(Math.max(1,Math.min(168,Number(process.env.CV_LINK_TTL_HOURS)||72)));return db.prepare('SELECT * FROM cv_configuration WHERE id=1').get();}
function active(db){return db.prepare('SELECT * FROM cv_documents WHERE id=?').get(config(db).active_document_id);}
function available(db){return Boolean(config(db).requests_enabled&&active(db));}
function send(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
function redirect(res){res.writeHead(303,{Location:'/admin/cv-management'});res.end();}
async function verify(d){const r=await(await remote('GET','/api/integrations/v1/files/'+d.remote_id)).json();if(r.item?.size!==d.byte_size||r.item?.sha256!==d.sha256)throw Error('CV storage metadata mismatch');}
async function stream(res,d,action,authorized=()=>true){
 if(!d)return send(res,503,'CV currently unavailable');
 try{
  await verify(d);
  const r=await remote('GET','/api/integrations/v1/files/'+d.remote_id+'/download');
  if(!authorized()){await r.body?.cancel();return send(res,410,'CV link expired or revoked');}
  const name=d.original_name.replace(/[^\x20-\x7e]|["\\;]/g,'_');
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':String(d.byte_size),'Content-Disposition':(action==='preview'?'inline':'attachment')+'; filename="'+name+'"; filename*=UTF-8\'\''+encodeURIComponent(d.original_name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)),'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"});
  await pipeline(Readable.fromWeb(r.body),res);
 }catch{if(!res.headersSent)send(res,502,'CV storage unavailable. Please try again later.');else res.destroy();}
}
async function upload(req,db,name,activate){
 const type=req.headers['content-type']||'';
 const multipart=/^multipart\/form-data(?:;|$)/i.test(type);
 if(!multipart&&!/^application\/octet-stream(?:;|$)/i.test(type))throw Error('Use a PDF file upload');
 const chunks=[];let total=0;
 for await(const c of req){total+=c.length;if(total>20e6+(multipart?65536:0)){req.resume();throw Error('PDF exceeds 20 MB');}chunks.push(c);}
 let bytes=Buffer.concat(chunks);
 if(multipart){
  let form;try{form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();}catch{throw Error('Invalid multipart upload');}
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function'||form.getAll('file').length!==1)throw Error('Select one PDF file');
  name=file.name;activate=form.get('activate')==='1';bytes=Buffer.from(await file.arrayBuffer());
 }
 const size=bytes.length;
 if(size>20e6)throw Error('PDF exceeds 20 MB');
 if(typeof name!=='string'||!name||name.length>150||!name.toLowerCase().endsWith('.pdf')||/[\\/\x00-\x1f\x7f]/.test(name))throw Error('Choose a PDF filename without path or control characters');
 if(!/^%PDF-\d\.\d/.test(bytes.toString('latin1',0,8))||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))throw Error('Invalid PDF header or end marker');
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const result=await(await remote('POST','/api/integrations/v1/files?'+new URLSearchParams({kind:'cv',entry:'1',name}),bytes)).json();
 if(!/^[a-f0-9-]{36}$/.test(result.item?.id||''))throw Error('Invalid storage response');
 try{
  await verify({remote_id:result.item.id,byte_size:size,sha256:sha});
  db.exec('BEGIN IMMEDIATE');
  const id=Number(db.prepare('INSERT INTO cv_documents(remote_id,original_name,byte_size,sha256) VALUES(?,?,?,?)').run(result.item.id,name,size,sha).lastInsertRowid);
  config(db);if(activate)db.prepare('UPDATE cv_configuration SET active_document_id=? WHERE id=1').run(id);
  db.exec('COMMIT');return id;
 }catch(e){try{db.exec('ROLLBACK');}catch{}await remote('DELETE','/api/integrations/v1/files/'+result.item.id).catch(()=>{});throw e;}
}
function page(db,auth,adminShell){const c=config(db),a=active(db),rows=db.prepare('SELECT * FROM cv_documents ORDER BY id DESC').all();const csrf=`<input type="hidden" name="_csrf" value="${esc(auth.csrf)}">`;
 const details=d=>`<strong style="overflow-wrap:anywhere">${esc(d.original_name)}</strong><p>Version ${d.id} · ${(d.byte_size/1024).toFixed(1)} KB · ${esc(d.created_at)} UTC</p><div class="cv-admin-actions"><a class="button secondary" target="_blank" rel="noopener" href="/admin/cv-management/${d.id}/preview">Preview</a><a class="button secondary" href="/admin/cv-management/${d.id}/download">Download</a></div>`;
 return adminShell(`<div class="admin-page-title"><div><h1>CV Management</h1><p>Private original PDFs stored in Febro Files. Approved links remain pinned to their CV version.</p></div></div><section class="admin-panel"><h2>Active CV</h2>${a?details(a):'<p role="status">No active CV uploaded. New CV requests are unavailable.</p>'}<p>Status: ${available(db)?'Requests enabled':'Requests unavailable'}</p></section><section class="admin-panel"><h2>Upload New CV</h2><form id="cv-upload" class="cv-management-form" method="post" action="/admin/cv-management/upload" enctype="multipart/form-data"><label>Select PDF (maximum 20 MB)<input id="cv-file" name="file" type="file" accept="application/pdf,.pdf" required></label><p><label><input id="cv-activate" name="activate" value="1" type="checkbox" checked> Activate after upload</label></p><button class="button primary">Upload</button><p id="cv-upload-status" role="status" aria-live="polite"></p></form></section><section class="admin-panel"><h2>Version History</h2>${rows.map(d=>`<article style="padding:16px 0;border-bottom:1px solid var(--border)">${details(d)}<p>${d.id===c.active_document_id?'Active':`<form method="post" action="/admin/cv-management/${d.id}/activate">${csrf}<button class="button secondary">Activate version ${d.id}</button></form>`}</p></article>`).join('')||'<p>No CV versions uploaded.</p>'}</section><section class="admin-panel"><h2>Settings</h2><form class="cv-management-form" method="post" action="/admin/cv-management/settings">${csrf}<label><input name="enabled" type="checkbox" value="1" ${c.requests_enabled?'checked':''}> Enable new CV requests</label><p><label>Default approval duration (hours)<input name="hours" type="number" required min="1" max="168" value="${c.approval_hours}"></label></p><button class="button primary">Save settings</button></form><p>Disabling new requests preserves existing approved links. Revoke those links in CV Requests when needed. Legacy approved links pin on their first successful use.</p></section><script src="/cv-management.js" data-csrf="${esc(auth.csrf)}" defer></script>`,'CV Management',auth);
}
async function handle(req,res,ctx){const {db,auth,url,pathname,adminShell,readForm,csrfValid}=ctx;
 if(pathname==='/admin/cv-management'&&req.method==='GET')return send(res,200,page(db,auth,adminShell),'text/html; charset=utf-8');
 const m=pathname.match(/^\/admin\/cv-management\/(\d+)\/(preview|download|activate)$/);
 if(m&&req.method==='GET'&&m[2]!=='activate')return stream(res,db.prepare('SELECT * FROM cv_documents WHERE id=?').get(Number(m[1])),m[2]);
 if(req.method!=='POST')return send(res,405,'Method not allowed');
 if(pathname==='/admin/cv-management/upload'){
  if(!csrfValid(auth,{_csrf:req.headers['x-csrf-token']}))return send(res,403,'Forbidden');
  try{const id=await upload(req,db,url.searchParams.get('name'),url.searchParams.get('activate')==='1');return send(res,201,JSON.stringify({id}),'application/json');}catch(e){return send(res,/Storage|storage|integration/.test(e.message)?502:/exceeds 20 MB/.test(e.message)?413:400,/Storage|storage|integration/.test(e.message)?'Private storage is unavailable. Please retry or contact the administrator.':e.message);}
 }
 const p=await readForm(req);if(!csrfValid(auth,p))return send(res,403,'Forbidden');config(db);
 if(pathname==='/admin/cv-management/settings'){const hours=Number(p.hours);if(!Number.isInteger(hours)||hours<1||hours>168)return send(res,400,'Duration must be 1–168 hours');db.prepare('UPDATE cv_configuration SET requests_enabled=?,approval_hours=? WHERE id=1').run(p.enabled==='1'?1:0,hours);return redirect(res);}
 if(m&&m[2]==='activate'){const d=db.prepare('SELECT * FROM cv_documents WHERE id=?').get(Number(m[1]));if(!d)return send(res,404,'CV version not found');try{await verify(d);}catch{return send(res,502,'CV storage unavailable');}db.prepare('UPDATE cv_configuration SET active_document_id=? WHERE id=1').run(d.id);return redirect(res);}
 return send(res,404,'Not found');
}
module.exports={config,active,available,verify,stream,upload,handle};
