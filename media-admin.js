'use strict';
const {upload,remote,roles}=require('./media-client');
const crypto=require('node:crypto');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function send(res,status,body,type='text/html; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
function csrf(auth,value){return typeof value==='string'&&value.length===auth.csrf.length&&crypto.timingSafeEqual(Buffer.from(value),Buffer.from(auth.csrf));}
async function handle(req,res,{db,auth,url,pathname}){
 const m=pathname.match(/^\/admin\/media\/(\d+)(?:\/(\d+))?$/);
 if(!m)return false;
 const entryId=Number(m[1]),fileId=Number(m[2]||0);
 const entry=db.prepare('SELECT id,kind,title FROM entries WHERE id=?').get(entryId);
 if(!entry)return send(res,404,'Entry not found');
 if(req.method==='GET'&&!fileId){
  const rows=db.prepare('SELECT id,role,original_name,byte_size FROM entry_files WHERE entry_id=? ORDER BY id DESC').all(entryId);
  const items=rows.map(x=>'<li>'+esc(x.original_name)+' ('+esc(x.role)+') <a target="_blank" rel="noopener" href="/media/file/'+x.id+'/preview">Preview</a> · <a href="/media/file/'+x.id+'/download">Download</a> <button data-delete="'+x.id+'" type="button">Move to Trash</button></li>').join('');
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media Manager</title><link rel="stylesheet" href="/app.css"></head><body class="admin-page"><main style="max-width:800px;margin:auto;padding:24px"><a href="/admin/content?kind='+encodeURIComponent(entry.kind)+'">Back to content</a><h1>Media — '+esc(entry.title)+'</h1><p>Files are stored in Febro Files. New files are private by default.</p><label>Role <select id="role"><option>cover</option><option>gallery</option><option>document</option><option>certificate</option><option>attachment</option></select></label><p><input id="file" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf"></p><button id="upload" type="button">Upload</button><p id="status" role="status"></p><ul>'+items+'</ul></main><script>const csrf='+JSON.stringify(auth.csrf)+';const base='+JSON.stringify('/admin/media/'+entryId)+';document.querySelector("#upload").onclick=async()=>{const f=document.querySelector("#file").files[0];if(!f)return;const status=document.querySelector("#status");status.textContent="Uploading…";try{const r=await fetch(base+"?"+new URLSearchParams({role:document.querySelector("#role").value,name:f.name}),{method:"POST",headers:{"Content-Type":"application/octet-stream","X-CSRF-Token":csrf},body:f});if(!r.ok)throw Error(await r.text());location.reload()}catch(e){status.textContent=e.message}};document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=await fetch(base+"/"+b.dataset.delete,{method:"DELETE",headers:{"X-CSRF-Token":csrf}});if(r.ok)location.reload();else alert(await r.text())});</script></body></html>';
  return send(res,200,html);
 }
 if(!csrf(auth,req.headers['x-csrf-token']))return send(res,403,'Forbidden');
 if(req.method==='POST'&&!fileId){
  try{
   const role=url.searchParams.get('role'),name=url.searchParams.get('name');
   if(!roles.has(role))return send(res,400,'Invalid role');
   const item=await upload(req,entry.kind,entryId,role,name);
   try{db.prepare('INSERT INTO entry_files(entry_id,remote_id,role,original_name,mime_type,byte_size,sha256) VALUES(?,?,?,?,?,?,?)').run(entryId,item.remoteId,role,item.name,item.mime,item.size,item.sha256);}
   catch(e){await remote('DELETE','/api/integrations/v1/files/'+item.remoteId).catch(()=>{});throw e;}
   return send(res,201,'{"ok":true}','application/json');
  }catch(e){return send(res,502,e.message,'text/plain');}
 }
 if(req.method==='DELETE'&&fileId){
  const row=db.prepare('SELECT remote_id FROM entry_files WHERE entry_id=? AND id=?').get(entryId,fileId);
  if(!row)return send(res,404,'Not found');
  try{await remote('DELETE','/api/integrations/v1/files/'+row.remote_id);db.prepare('DELETE FROM entry_files WHERE id=?').run(fileId);return send(res,200,'{"ok":true}','application/json');}catch(e){return send(res,502,e.message,'text/plain');}
 }
 return send(res,405,'Method not allowed');
}
module.exports={handle};
