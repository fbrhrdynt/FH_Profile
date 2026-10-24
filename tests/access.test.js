'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root='/opt/febro',temp=fs.mkdtempSync(path.join(os.tmpdir(),'document-access-'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let cms,files,db,fdb,base,fb,cookie,csrf,entry,ids=[],children=[];
const req=(p,o={})=>fetch(base+p,{redirect:'manual',...o});
const form=(p,c=cookie)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(c?{cookie:c}:{})},body:new URLSearchParams(p)});
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function start(cwd,args,env){const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'ignore'});children.push(child);for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+env.PORT+'/health')).ok)return child;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Server startup failed');}
async function submit(selected=ids){const page=await req('/access-request');const sc=page.headers.get('set-cookie').split(';')[0],token=(await page.text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];const p={_csrf:token,name:'Visitor',email:'visitor@example.com',phone:'+62 812345678',reason:'Engineering review'};for(const id of selected)p['file_'+id]='1';const r=await req('/access-request',form(p,sc));assert.equal(r.status,201);return db.prepare('SELECT * FROM access_requests ORDER BY id DESC LIMIT 1').get();}
async function review(id,action,extra={}){return req(`/admin/access-requests/${id}/${action}`,form({_csrf:csrf,hours:'24',...extra}));}
function token(){const text=fs.readFileSync(path.join(temp,'mail.jsonl'),'utf8').trim().split('\n').map(JSON.parse).at(-1).text;return text.match(/https:\/\/files.febro.id\/access#([a-f0-9]{64})/)[1];}
async function unlock(t){const r=await fetch(fb+'/access/session',{method:'POST',headers:{Origin:fb,'Content-Type':'application/json'},body:JSON.stringify({token:t})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const fileReq=(p,c)=>fetch(fb+p,{headers:c?{cookie:c}:{}});
test.before(async()=>{
 const cp=await port(),fp=await port();base='http://127.0.0.1:'+cp;fb='http://127.0.0.1:'+fp;
 cms=await start(root,['--require','./tests/mock-nodemailer.cjs','server.js'],{PORT:String(cp),HOST:'127.0.0.1',DATA_DIR:path.join(temp,'cms'),APP_URL:'https://febro.id',SMTP_HOST:'mock',SMTP_USER:'mock',SMTP_PASS:'mock',FH_MAIL_TEST_LOG:path.join(temp,'mail.jsonl'),FH_MAIL_TEST_FAIL_FILE:path.join(temp,'fail'),FEBRO_FILES_API_URL:fb,FEBRO_PROFILE_SERVICE_TOKEN:'s'.repeat(64)});
 db=new DatabaseSync(path.join(temp,'cms/profile.sqlite'));db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)').run('review@example.com',require('../scripts').hashPassword('test-only-password'));
 const login=await req('/admin/login',form({email:'review@example.com',password:'test-only-password'},''));cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await(await req('/admin',{headers:{cookie}})).text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
 files=await start('/opt/febro-files',['src/server.mjs'],{PORT:String(fp),HOST:'127.0.0.1',DATA_DIR:path.join(temp,'files'),NODE_ENV:'test',APP_URL:fb,FEBRO_CMS_DB:path.join(temp,'cms/profile.sqlite'),FEBRO_PROFILE_SERVICE_TOKEN:'s'.repeat(64)});
 entry=db.prepare("SELECT id FROM entries WHERE kind='project' LIMIT 1").get().id;db.prepare("UPDATE entries SET access_mode='detail' WHERE id=?").run(entry);
 for(let i=0;i<3;i++){
 const data=Buffer.from('%PDF-1.4\nDocument '+i),r=await fetch(fb+'/api/integrations/v1/files?'+new URLSearchParams({kind:'project',entry:String(entry),name:`test-${i}.pdf`}),{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(64),'Content-Type':'application/octet-stream'},body:data});assert.equal(r.status,201);const remote=(await r.json()).item.id;
 ids.push(Number(db.prepare("INSERT INTO entry_files(entry_id,remote_id,role,original_name,mime_type,byte_size,requestable,allow_preview,allow_download) VALUES(?,?,'document',?,'application/pdf',?,1,1,1)").run(entry,remote,`test-${i}.pdf`,data.length).lastInsertRowid));
 }
});
test.after(async()=>{db?.close();for(const c of children)c.kill('SIGTERM');await Promise.all(children.map(c=>new Promise(r=>c.exitCode!==null?r():c.once('exit',r))));fs.rmSync(temp,{recursive:true,force:true});});
test('private defaults, public permissions, request form validation and CSRF',async()=>{
 assert.equal((await req(`/media/file/${ids[0]}/preview`)).status,404);
 db.prepare("UPDATE entry_files SET visibility='public',allow_download=0 WHERE id=?").run(ids[2]);
 assert.equal((await req(`/media/file/${ids[2]}/preview`)).status,404);assert.equal((await req(`/media/file/${ids[2]}/download`)).status,404);
 db.prepare('UPDATE entry_files SET requestable=0 WHERE id=?').run(ids[2]);assert.equal((await req(`/media/file/${ids[2]}/preview`)).status,200);assert.equal((await req(`/media/file/${ids[2]}/download`)).status,404);
 const page=await(await req('/access-request')).text();assert.match(page,new RegExp('file_'+ids[0]));assert.doesNotMatch(page,new RegExp('file_'+ids[2]));db.prepare('UPDATE entry_files SET requestable=1 WHERE id=?').run(ids[2]);
 assert.equal((await req('/access-request',form({name:'No CSRF'},''))).status,403);
 const session=await req('/access-request'),visitorCookie=session.headers.get('set-cookie').split(';')[0],visitorCsrf=(await session.text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
 const valid={_csrf:visitorCsrf,name:'Visitor',email:'visitor@example.com',phone:'12345678',reason:'Review'};
 assert.equal((await req('/access-request',form(valid,visitorCookie))).status,400);
 for(const field of ['name','email','phone','reason'])assert.equal((await req('/access-request',form({...valid,[field]:'',['file_'+ids[0]]:'1'},visitorCookie))).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM access_requests').get().n,0);
 assert.equal((await review(1,'approve',{_csrf:'bad'})).status,403);
 assert.equal((await fileReq('/access/files')).status,410);
});
test('anonymous permission matrix applies to GET and HEAD',async()=>{
 const id=ids[2];for(const visibility of ['public','private','unlisted'])for(const requestable of [0,1])for(const allow_preview of [0,1])for(const allow_download of [0,1]){
 db.prepare('UPDATE entry_files SET visibility=?,requestable=?,allow_preview=?,allow_download=? WHERE id=?').run(visibility,requestable,allow_preview,allow_download,id);
 for(const action of ['preview','download'])for(const method of ['GET','HEAD']){
 const expected=visibility==='public'&&!requestable&&(action==='preview'?(allow_preview||allow_download):allow_download)?200:404;
 assert.equal((await req(`/media/file/${id}/${action}`,{method})).status,expected,JSON.stringify({visibility,requestable,allow_preview,allow_download,action,method}));}
 }db.prepare("UPDATE entry_files SET visibility='public',requestable=1,allow_preview=1,allow_download=0 WHERE id=?").run(id);
});
test('partial approval exposes only selected files; arbitrary file IDs and disabled operations fail',async()=>{
 const r=await submit(ids.slice(0,2));assert.equal(db.prepare('SELECT COUNT(*) n FROM access_items WHERE request_id=?').get(r.id).n,2);
 assert.equal((await review(r.id,'partial',{['file_'+ids[0]]:'1'})).status,303);const t=token(),grant=db.prepare('SELECT * FROM access_requests WHERE id=?').get(r.id);assert.equal(grant.status,'partial');assert.equal(grant.token_hash,hash(t));assert.notEqual(grant.token_hash,t);
 const c=await unlock(t),listing=await(await fileReq('/access/files',c)).json();assert.deepEqual(listing.files.map(x=>x.id),[ids[0]]);
 assert.doesNotMatch(JSON.stringify(listing),/remote_id|service:|token_hash/);const remote=db.prepare('SELECT remote_id FROM entry_files WHERE id=?').get(ids[0]).remote_id;for(const action of ['preview','download']){assert.equal((await fileReq('/api/integrations/v1/files/'+remote+'/'+action,c)).status,401);assert.equal((await fileReq('/api/items/'+remote+'/'+action,c)).status,401);}
 assert.equal((await fileReq(`/access/files/${ids[0]}/preview`,c)).status,200);assert.equal((await fileReq(`/access/files/${ids[0]}/download`,c)).status,200);
 assert.equal((await fileReq(`/access/files/${ids[1]}/preview`,c)).status,404);assert.equal((await fileReq(`/access/files/${ids[2]}/download`,c)).status,404);
 db.prepare('UPDATE entry_files SET allow_download=0 WHERE id=?').run(ids[0]);assert.equal((await fileReq(`/access/files/${ids[0]}/download`,c)).status,404);db.prepare('UPDATE entry_files SET allow_download=1 WHERE id=?').run(ids[0]);
 assert.equal((await review(r.id,'revoke')).status,303);for(const route of ['/access/files',`/access/files/${ids[0]}/preview`,`/access/files/${ids[0]}/download`])assert.equal((await fileReq(route,c)).status,410);
});
test('full approval, expiry, rejection, email failure and invalid origins',async()=>{
 const r=await submit(ids.slice(0,2));assert.equal((await review(r.id,'approve')).status,303);let c=await unlock(token());assert.equal((await(await fileReq('/access/files',c)).json()).files.length,2);
 db.prepare('UPDATE access_requests SET expires_at=? WHERE id=?').run(Date.now()-1,r.id);for(const p of ['/access/files',`/access/files/${ids[0]}/preview`,`/access/files/${ids[0]}/download`])assert.equal((await fileReq(p,c)).status,410);
 assert.equal((await review(r.id,'reject')).status,303);assert.equal(db.prepare('SELECT status FROM access_requests WHERE id=?').get(r.id).status,'rejected');
 fs.writeFileSync(path.join(temp,'fail'),'1');assert.equal((await review(r.id,'approve')).status,502);const failed=db.prepare('SELECT * FROM access_requests WHERE id=?').get(r.id);assert.equal(failed.status,'email_failed');assert.equal(failed.token_hash,null);assert.equal((await fileReq('/access/files',c)).status,410);fs.unlinkSync(path.join(temp,'fail'));
 assert.equal((await fetch(fb+'/access/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({token:'a'.repeat(64)})})).status,403);
});
test('public cover and gallery render while private images remain hidden',async()=>{
 const content=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const uploaded=await fetch(fb+'/api/integrations/v1/files?'+new URLSearchParams({kind:'project',entry:String(entry),name:'cover.png'}),{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(64),'Content-Type':'application/octet-stream'},body:content});assert.equal(uploaded.status,201);const remote=(await uploaded.json()).item.id;
 const id=Number(db.prepare("INSERT INTO entry_files(entry_id,remote_id,role,original_name,mime_type,byte_size,allow_preview) VALUES(?,?,'cover','cover.png','image/png',?,1)").run(entry,remote,content.length).lastInsertRowid);
 const route='/portfolio/'+db.prepare('SELECT slug FROM entries WHERE id=?').get(entry).slug;
 assert.doesNotMatch(await(await req('/portfolio')).text(),new RegExp('/media/file/'+id+'/preview'));
 db.prepare("UPDATE entry_files SET visibility='public' WHERE id=?").run(id);
 for(const p of ['/portfolio',route])assert.match(await(await req(p)).text(),new RegExp('/media/file/'+id+'/preview'));
 db.prepare('UPDATE entry_files SET requestable=1 WHERE id=?').run(id);
 for(const p of ['/portfolio',route])assert.doesNotMatch(await(await req(p)).text(),new RegExp('/media/file/'+id+'/preview'));
 assert.equal((await req('/media/file/'+id+'/preview')).status,404);
 db.prepare('UPDATE entry_files SET requestable=0 WHERE id=?').run(id);
 db.prepare("UPDATE entry_files SET role='gallery',caption='Public gallery' WHERE id=?").run(id);
 const projectHtml=await(await req(route)).text();assert.match(projectHtml,/Public gallery/);assert.ok(projectHtml.indexOf('Overview')<projectHtml.indexOf('Image Gallery'));assert.ok(projectHtml.indexOf('Image Gallery')<projectHtml.indexOf('<h2>Documents</h2>'));assert.equal((await req('/media/file/'+id+'/download')).status,404);
 db.prepare('UPDATE entries SET enabled=0 WHERE id=?').run(entry);assert.equal((await req('/media/file/'+id+'/preview')).status,404);db.prepare('UPDATE entries SET enabled=1 WHERE id=?').run(entry);
});
test('certificate multi-select, media editor and daily rate limit',async()=>{
 const cert=Number(db.prepare("INSERT INTO entries(kind,slug,title) VALUES('certification','test-cert','Certificate test')").run().lastInsertRowid);db.prepare('UPDATE entry_files SET entry_id=? WHERE id IN (?,?)').run(cert,ids[0],ids[1]);
 db.prepare("UPDATE entries SET company='Test issuer',year='2026' WHERE id=?").run(cert);
 const html=await(await req('/access-request?kind=certification')).text();assert.match(html,/Issuer: Test issuer/);assert.match(html,/Year: 2026/);for(const id of ids.slice(0,2))assert.match(html,new RegExp('file_'+id));
 const editor=await(await req('/admin/media/'+cert,{headers:{cookie}})).text();assert.match(editor,/Simpan izin/);assert.match(editor,/name="requestable"/);assert.match(editor,/Request Access/);
 const defaultAccess=await req(`/admin/media/${cert}/${ids[0]}`,form({_csrf:csrf,visibility:'public',requestable:'1',caption:'Preview after approval',sort_order:'7'}));assert.equal(defaultAccess.status,303);
 const defaultRow=db.prepare('SELECT * FROM entry_files WHERE id=?').get(ids[0]);assert.equal(defaultRow.allow_preview,0);assert.equal(defaultRow.allow_download,0);
 for(const action of ['preview','download'])assert.equal((await req(`/media/file/${ids[0]}/${action}`)).status,404);
 const previewRequest=await submit([ids[0]]);assert.equal((await review(previewRequest.id,'approve')).status,303);const previewCookie=await unlock(token());assert.equal((await fileReq(`/access/files/${ids[0]}/preview`,previewCookie)).status,200);assert.equal((await fileReq(`/access/files/${ids[0]}/download`,previewCookie)).status,404);
 // Enabling download later cannot widen this preview-only grant.
 db.prepare('UPDATE entry_files SET allow_download=1 WHERE id=?').run(ids[0]);assert.equal((await fileReq(`/access/files/${ids[0]}/download`,previewCookie)).status,404);
 for(const operation of ['allow_preview','allow_download']){
 const result=await req(`/admin/media/${cert}/${ids[0]}`,form({_csrf:csrf,visibility:'private',requestable:'1',[operation]:'1',caption:'Private '+operation,sort_order:'0'}));assert.equal(result.status,303);
 const stored=db.prepare('SELECT * FROM entry_files WHERE id=?').get(ids[0]);assert.equal(stored.visibility,'private');assert.equal(stored.requestable,1);assert.equal(stored.allow_preview,1);assert.equal(stored.allow_download,operation==='allow_download'?1:0);
 for(const action of ['preview','download'])assert.equal((await req(`/media/file/${ids[0]}/${action}`)).status,404);
 const feedback=await(await req(result.headers.get('location'),{headers:{cookie}})).text();assert.match(feedback,/Izin berhasil disimpan/);
 }
 const badMetadata=await req(`/admin/media/${cert}/${ids[0]}`,form({_csrf:csrf,visibility:'private',caption:'Still here',sort_order:'not-a-number'}));assert.equal(badMetadata.status,400);assert.match(await badMetadata.text(),/value="Still here"/);
 const denied=await req(`/admin/media/${cert}/${ids[0]}`,form({_csrf:'bad',visibility:'public',sort_order:'0'}));assert.equal(denied.status,403);assert.match(await denied.text(),/No settings were changed/);assert.equal(db.prepare('SELECT visibility FROM entry_files WHERE id=?').get(ids[0]).visibility,'private');
 const listing=await(await req('/admin/access-requests',{headers:{cookie}})).text();assert.match(listing,/Visitor/);
 const saved=await req(`/admin/media/${cert}/${ids[0]}`,form({_csrf:csrf,visibility:'private',requestable:'1',allow_preview:'1',allow_download:'1',caption:'Verified caption',sort_order:'5'}));assert.equal(saved.status,303);assert.equal(db.prepare('SELECT caption FROM entry_files WHERE id=?').get(ids[0]).caption,'Verified caption');
 db.prepare("UPDATE access_requests SET ip_hash='isolated-history'").run();for(let i=0;i<5;i++)await submit(ids.slice(0,2));
 const p=await req('/access-request'),c=p.headers.get('set-cookie').split(';')[0],t=(await p.text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];const r=await req('/access-request',form({_csrf:t,name:'Visitor',email:'visitor@example.com',phone:'12345678',reason:'Review',['file_'+ids[0]]:'1'},c));assert.equal(r.status,429);
});

 test('dashboard displays database statistics and all CMS navigation routes work',async()=>{
 const page=await req('/admin',{headers:{cookie}});assert.equal(page.status,200);const html=await page.text();
 for(const label of ['Portfolio','Certifications','Access Requests','CV Requests','Contact Inbox','Storage','Recent Activity','Pending Approvals','New Project','New Blog Post','Manage Certificates','Upload CV','Review Requests'])assert.ok(html.includes(label),label);
 for(const url of ['/admin','/admin/content?kind=project','/admin/content?kind=post','/admin/content?kind=tool','/admin/content?kind=experience','/admin/content?kind=education','/admin/content?kind=certification','/admin/cv-management','/admin/access-requests','/admin/cv-requests','/admin/contact-messages','/admin/project-categories','/admin/settings','/admin/content/new?kind=project','/admin/content/new?kind=post']){
 assert.equal((await req(url,{headers:{cookie}})).status,200,url);assert.equal((await req(url)).status,303,'unauthenticated '+url);
 }
 const nav=html.match(/<nav aria-label="CMS navigation">([\s\S]*?)<\/nav>/)[1];const links=[...nav.matchAll(/href="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(links).size,13);assert.equal(links.length,13);assert.match(nav,/aria-current="page"/);
 });

test('Skill Groups visual editor preserves JSON and malformed legacy data',async()=>{
 const valid=JSON.stringify({'Engineering':['PLC','Electrical'],'Web':['Node.js']});
 db.prepare("UPDATE settings SET value=? WHERE key='skills_json'").run(valid);
 const editor=await(await req('/admin/settings',{headers:{cookie}})).text();assert.match(editor,/id="skill-editor"/);assert.doesNotMatch(editor,/<textarea name="skills_json"/);
 assert.equal((await req('/admin/settings',form({_csrf:csrf,skills_json:valid}))).status,303);assert.equal(db.prepare("SELECT value FROM settings WHERE key='skills_json'").get().value,valid);
 assert.match(await(await req('/about')).text(),/PLC/);
 const malformed='{legacy broken'+('x'.repeat(21000));db.prepare("UPDATE settings SET value=? WHERE key='skills_json'").run(malformed);
 assert.equal((await req('/admin/settings',form({_csrf:csrf,skills_json:malformed}))).status,303);assert.equal(db.prepare("SELECT value FROM settings WHERE key='skills_json'").get().value,malformed);
 assert.equal((await req('/about')).status,200);
 assert.equal((await req('/admin/settings',form({_csrf:csrf,skills_json:'{"Bad":5}'}))).status,400);assert.equal(db.prepare("SELECT value FROM settings WHERE key='skills_json'").get().value,malformed);
});
