'use strict';
const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locks=new Set(),attempts=new Map();
function candidates(db,entry=0){return db.prepare("SELECT f.*,e.title,e.kind,e.company,e.year FROM entry_files f JOIN entries e ON e.id=f.entry_id WHERE e.enabled=1 AND e.kind IN ('project','certification') AND f.requestable=1 AND (?=0 OR e.id=?) ORDER BY e.title,f.sort_order,f.id").all(entry,entry);}
function media(db,id,cover=false){
 const rows=db.prepare("SELECT f.* FROM entry_files f JOIN entries e ON e.id=f.entry_id WHERE f.entry_id=? AND e.enabled=1 ORDER BY f.sort_order,f.id").all(id);
 const preview=f=>f.visibility==='public'&&!f.requestable&&(f.allow_preview||f.allow_download);
 const image=f=>['image/png','image/jpeg','image/webp'].includes(f.mime_type);
 const picture=f=>`<figure><img class="access-cover" src="/media/file/${f.id}/preview" alt="${esc(f.caption||f.original_name)}" loading="lazy" decoding="async"><figcaption>${esc(f.caption)}</figcaption></figure>`;
 if(cover){const f=rows.find(f=>f.role==='cover'&&image(f)&&preview(f));return f?picture(f):'';}
 const gallery=rows.filter(f=>f.role!=='cover'&&image(f)&&preview(f));
 const docs=rows.filter(f=>f.requestable||(!image(f)&&f.visibility==='public'));
 return `<section class="access-media">${gallery.length?`<h2>Image Gallery</h2><div class="portfolio-gallery">${gallery.map(picture).join('')}</div>`:''}${docs.length?`<h2>Documents</h2>${docs.map(f=>`<article class="document-card"><strong>${esc(f.original_name)}</strong><small>${esc(f.mime_type.split('/')[1].toUpperCase())}</small><p>${esc(f.caption)}</p><div class="row-actions">${f.requestable?`<a class="button secondary" href="/access-request?entry=${id}">Request Access</a>`:`${preview(f)?`<a href="/media/file/${f.id}/preview" target="_blank" rel="noopener">Preview</a>`:''}${preview(f)&&f.allow_download?`<a href="/media/file/${f.id}/download">Download</a>`:''}`}</div></article>`).join('')}`:''}</section>`;
}
function setup(c){const {db,mail,send,redirect,readForm,csrfValid,adminShell,page,getSettings}=c;
 const history=(id,actor,event)=>db.prepare('INSERT INTO access_history(request_id,actor,event) VALUES(?,?,?)').run(id,actor,event);
 const output=(res,status,body,headers={})=>send(res,status,body,'text/html; charset=utf-8',{'Cache-Control':'no-store',...headers});
 const publicPage=(res,status,body,headers)=>output(res,status,page({site:getSettings(),title:'Document access',body:`<main class="inner-page content-width"><h1>Document access</h1>${body}</main>`,robots:'noindex'}),headers);
 return async function(req,res,url,auth){const path=url.pathname;
 if(path==='/access-request'){
  if(req.method==='GET'){
   const token=crypto.randomBytes(32).toString('hex'),rows=candidates(db,Number(url.searchParams.get('entry'))||0).filter(f=>!['project','certification'].includes(url.searchParams.get('kind'))||f.kind===url.searchParams.get('kind'));
   return publicPage(res,200,`<p>Select the documents you need. Approval is required before access is granted.</p><form method="post" class="settings-form" action="/access-request"><input type="hidden" name="_csrf" value="${token}">${rows.map(f=>`<label class="check-row"><input type="checkbox" name="file_${f.id}" value="1"><span><strong>${esc(f.title)}</strong><br>Issuer: ${esc(f.company||'Not specified')} · Year: ${esc(f.year||'Not specified')}<br>${esc(f.caption||f.original_name)}</span></label>`).join('')||'<p>No requestable documents are currently available.</p>'}${[['name','Name','text'],['email','Email','email'],['phone','Phone number','tel']].map(([n,l,t])=>`<label class="form-field"><span>${l}</span><input name="${n}" type="${t}" maxlength="${n==='email'?254:120}" autocomplete="${n==='phone'?'tel':n}" required></label>`).join('')}<label class="form-field"><span>Reason for access</span><textarea name="reason" maxlength="2000" required></textarea></label><button class="button primary" ${rows.length?'':'disabled'}>Submit request</button><p role="status">You will receive an email after review.</p></form><script>document.querySelector('form[action="/access-request"]').addEventListener("submit",function(event){if(!this.querySelector("input[type=checkbox]:checked")){event.preventDefault();this.querySelector("[role=status]").textContent="Select at least one document.";return;}const button=this.querySelector("button");button.disabled=true;button.textContent="Submitting…";this.querySelector("[role=status]").textContent="Sending your request…";});</script>`,{'Set-Cookie':`fh_access_csrf=${token}; HttpOnly; SameSite=Strict; Path=/access-request; Max-Age=3600${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`});
  }
  if(req.method!=='POST')return publicPage(res,405,'Method not allowed');
  const addr=hash(String(req.headers['x-real-ip']||req.socket.remoteAddress)),now=Date.now();
  for(const [key,v] of attempts)if(v.until<=now)attempts.delete(key);
  const attempt=attempts.get(addr)||{count:0,until:now+600000};attempts.set(addr,attempt);
  if(++attempt.count>30||attempts.size>20000)return publicPage(res,429,'Too many submissions. Please try later.');
  const p=await readForm(req),cookie=String(req.headers.cookie||'').match(/(?:^|;\s*)fh_access_csrf=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!cookie||p._csrf!==cookie||req.headers.origin&&req.headers.origin!==mail.baseUrl()&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(req.headers.origin))return publicPage(res,403,'Invalid form session. <a href="/access-request">Start again</a>.');
  const r={name:String(p.name||'').trim(),email:String(p.email||'').trim().toLowerCase(),phone:String(p.phone||'').trim(),reason:String(p.reason||'').trim()};
  const ids=Object.keys(p).filter(k=>/^file_\d+$/.test(k)&&p[k]==='1').map(k=>Number(k.slice(5))),allowed=candidates(db);
  if(!r.name||r.name.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||r.email.length>254||!/[0-9]/.test(r.phone)||!/^[-+() .0-9]{5,40}$/.test(r.phone)||!r.reason||r.reason.length>2000||!ids.length||ids.length>100||ids.some(id=>!allowed.some(f=>f.id===id)))return publicPage(res,400,'Please select at least one available document and provide your name, valid email, phone number (5–40 characters), and reason (up to 2000 characters). <a href="/access-request">Try again</a>.');
  const ip=hash(String(req.headers['x-real-ip']||req.socket.remoteAddress));
  if(db.prepare("SELECT COUNT(*) n FROM access_requests WHERE ip_hash=? AND created_at>=datetime('now','-1 day')").get(ip).n>=5)return publicPage(res,429,'Daily request limit reached. Please try tomorrow.');
  db.exec('BEGIN IMMEDIATE');try{r.id=Number(db.prepare('INSERT INTO access_requests(name,email,phone,reason,ip_hash) VALUES(?,?,?,?,?)').run(r.name,r.email,r.phone,r.reason,ip).lastInsertRowid);for(const id of ids)db.prepare('INSERT INTO access_items(request_id,file_id) VALUES(?,?)').run(r.id,id);history(r.id,'visitor','submitted');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  try{await mail.accessNotification(r,'new');db.prepare("UPDATE access_requests SET delivery='sent' WHERE id=?").run(r.id);}catch{db.prepare("UPDATE access_requests SET delivery='failed' WHERE id=?").run(r.id);history(r.id,'system','admin notification failed');}
  return publicPage(res,201,`<p role="status">Request #${r.id} received. We will email you after review.</p><a href="/portfolio">Back to portfolio</a>`);
 }
 if(!path.startsWith('/admin/access-requests'))return false;
 if(!auth)return redirect(res,'/admin/login');
 const m=path.match(/^\/admin\/access-requests\/(\d+)\/(approve|partial|reject|revoke)$/);
 if(m&&req.method==='POST'){
  const p=await readForm(req);if(!csrfValid(auth,p))return output(res,403,'Forbidden');const id=Number(m[1]),action=m[2],r=db.prepare('SELECT * FROM access_requests WHERE id=?').get(id);if(!r)return output(res,404,'Request not found');if(locks.has(id))return output(res,409,'Review already in progress');locks.add(id);
  try{
   if(action==='revoke'||action==='reject'){
    db.prepare('UPDATE access_requests SET status=?,token_hash=NULL,expires_at=0 WHERE id=?').run(action==='reject'?'rejected':'revoked',id);db.prepare('UPDATE access_items SET approved=0 WHERE request_id=?').run(id);history(id,auth.email,action);
    if(action==='reject')try{await mail.accessNotification(r,'rejected');history(id,auth.email,'rejection email sent');}catch{history(id,auth.email,'rejection email failed');return output(res,502,'Request rejected; notification failed. Retry rejection to resend. <a href="/admin/access-requests">Return</a>');}
   }else{
    const hours=Number(p.hours),items=db.prepare('SELECT f.* FROM access_items i JOIN entry_files f ON f.id=i.file_id JOIN entries e ON e.id=f.entry_id WHERE i.request_id=? AND e.enabled=1 AND f.requestable=1').all(id),selected=action==='approve'?items:items.filter(f=>p['file_'+f.id]==='1');
    if(!Number.isInteger(hours)||hours<1||hours>2160||!selected.length)return output(res,400,'Choose at least one file and a duration from 1 to 2160 hours.');
    // Disable previous grant before mail; failed email can never leave an active approval.
    db.prepare("UPDATE access_requests SET status='email_pending',token_hash=NULL,expires_at=0 WHERE id=?").run(id);db.prepare('UPDATE access_items SET approved=0 WHERE request_id=?').run(id);
    const token=crypto.randomBytes(32).toString('hex');r.expires_at=Date.now()+hours*3600000;
    try{await mail.accessNotification(r,selected.length===items.length?'approved':'partially approved','https://files.febro.id/access#'+token);}catch{db.prepare("UPDATE access_requests SET status='email_failed' WHERE id=?").run(id);history(id,auth.email,'approval email failed');return output(res,502,'Email delivery failed. Access remains disabled. <a href="/admin/access-requests">Return</a>');}
    db.exec('BEGIN IMMEDIATE');try{for(const f of selected)db.prepare('UPDATE access_items SET approved=1,grant_preview=?,grant_download=? WHERE request_id=? AND file_id=?').run(f.allow_preview||f.allow_download||f.requestable?1:0,f.allow_download?1:0,id,f.id);db.prepare('UPDATE access_requests SET status=?,token_hash=?,expires_at=? WHERE id=?').run(selected.length===items.length?'approved':'partial',hash(token),r.expires_at,id);history(id,auth.email,action+' files '+selected.map(f=>f.id).join(',')+' expires '+r.expires_at);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   }
   return redirect(res,'/admin/access-requests');
  }finally{locks.delete(id);}
 }
 if(path!=='/admin/access-requests'||req.method!=='GET')return output(res,405,'Method not allowed');
 const rows=db.prepare('SELECT * FROM access_requests ORDER BY id DESC LIMIT 200').all();
 return output(res,200,adminShell(`<h1>Access Requests</h1>${rows.map(r=>{const items=db.prepare('SELECT f.*,i.approved,e.title FROM access_items i JOIN entry_files f ON f.id=i.file_id JOIN entries e ON e.id=f.entry_id WHERE i.request_id=?').all(r.id);return `<article class="admin-panel"><h2>#${r.id} ${esc(r.name)}</h2><p>${esc(r.email)} · ${esc(r.phone)}</p><p>${esc(r.reason)}</p><p>Status: ${esc(r.expires_at&&r.expires_at<=Date.now()&&['approved','partial'].includes(r.status)?'expired':r.status)} · Admin notification: ${esc(r.delivery)} · ${r.expires_at?'Expires '+esc(new Date(r.expires_at).toISOString()):'No active grant'}</p><form method="post"><input type="hidden" name="_csrf" value="${esc(auth.csrf)}">${items.map(f=>`<label class="check-row"><input type="checkbox" name="file_${f.id}" value="1" ${f.approved?'checked':''}>${esc(f.title)} — ${esc(f.original_name)} ${f.approved?'(approved)':''}</label>`).join('')}<label class="form-field">Access duration (hours)<input type="number" name="hours" min="1" max="2160" value="72" required></label><div class="row-actions">${[['approve','Approve all & email'],['partial','Partial approve & email'],['reject','Reject'],['revoke','Revoke']].map(([a,l])=>`<button class="button secondary" formaction="/admin/access-requests/${r.id}/${a}">${l}</button>`).join('')}</div></form><details><summary>Request history</summary>${db.prepare('SELECT * FROM access_history WHERE request_id=? ORDER BY id').all(r.id).map(h=>`<p>${esc(h.created_at)} · ${esc(h.actor)} · ${esc(h.event)}</p>`).join('')}</details></article>`;}).join('')||'<p>No requests yet.</p>'}`,'Access Requests',auth));
 };
}
module.exports={setup,media,candidates};
