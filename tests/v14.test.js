'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn}=require('node:child_process');const {DatabaseSync}=require('node:sqlite');
const ROOT=path.resolve(__dirname,'..');
async function port(){const srv=net.createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const num=srv.address().port;await new Promise(r=>srv.close(r));return num;}
let svc,filesChild,filesUrl;
const original=Buffer.from("%PDF-1.4\n1 0 obj<</Type /Catalog>>endobj\n%%EOF\n");
async function request(route,options={}){return fetch(svc.url+route,{redirect:'manual',...options});}
function form(params,cookie){return {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie}:{})},body:new URLSearchParams(params)};}
let db,csrf,cookie;
test.before(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fh-v14-flow-'));const p=await port();const fp=await port();filesUrl='http://127.0.0.1:'+fp;const log=path.join(dir,'emails.jsonl');
 const child=spawn(process.execPath,['--require','./tests/mock-nodemailer.cjs','server.js'],{cwd:ROOT,env:{...process.env,DATA_DIR:dir,PORT:String(p),HOST:'127.0.0.1',APP_URL:'https://febro.id',SMTP_HOST:'smtp.hostinger.com',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'info@logisourcedigital.web.id',SMTP_PASS:'example-only',SMTP_FROM:'Febro Herdyanto <info@logisourcedigital.web.id>',CV_ADMIN_EMAIL:'febroherdyanto@outlook.com',CV_LINK_TTL_HOURS:'72',FH_MAIL_TEST_LOG:log,FH_MAIL_TEST_FAIL_FILE:path.join(dir,'fail'),FEBRO_FILES_API_URL:filesUrl,FEBRO_PROFILE_SERVICE_TOKEN:'t'.repeat(64)},stdio:'ignore'});
 svc={dir,child,log,url:'http://127.0.0.1:'+p};let started=false;
 for(let i=0;i<70;i++){try{if((await request('/health')).ok){started=true;break}}catch{}await new Promise(r=>setTimeout(r,60));}
 if(!started)throw Error('Test server did not start');
 filesChild=spawn(process.execPath,['src/server.mjs'],{cwd:'/opt/febro-files',env:{...process.env,DATA_DIR:path.join(dir,'files'),PORT:String(fp),HOST:'127.0.0.1',APP_URL:filesUrl,NODE_ENV:'test',FEBRO_CMS_DB:path.join(dir,'profile.sqlite'),FEBRO_PROFILE_SERVICE_TOKEN:'t'.repeat(64)},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(filesUrl+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 db=new DatabaseSync(path.join(dir,'profile.sqlite'));
 const {hashPassword}=require('../scripts');db.prepare('INSERT INTO admins(email,password_hash) VALUES (?,?)').run('admin@example.com',hashPassword('secure-test-only-password'));
 const login=await request('/admin/login',form({email:'admin@example.com',password:'secure-test-only-password'}));
 assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
 const html=await (await request('/admin',{headers:{cookie}})).text();csrf=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
});
test.after(async()=>{db?.close();filesChild?.kill('SIGTERM');svc?.child.kill('SIGTERM');if(svc){await new Promise(r=>svc.child.once('exit',r));fs.rmSync(svc.dir,{recursive:true,force:true});}});
const emails=()=>fs.existsSync(svc.log)?fs.readFileSync(svc.log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
test('CV request → HTML admin email → approve → email temporary PDF → revoke',async()=>{
 assert.equal((await request('/api/cv-request',form({name:'Jane',email:'jane@example.com',company:'Review'}))).status,503);
 assert.equal((await request('/admin/cv-management')).status,303);
 const upload=(bytes,name='Original CV.pdf',activate='1',csrfValue=csrf)=>request('/admin/cv-management/upload?'+new URLSearchParams({name,activate}),{method:'POST',headers:{cookie,'Content-Type':'application/octet-stream','X-CSRF-Token':csrfValue},body:bytes});
 assert.equal((await upload(original,'x.pdf','1','bad')).status,403);
 assert.equal((await upload(Buffer.from('fake'),'x.pdf')).status,400);
 assert.equal((await upload(original,'x.txt')).status,400);
 assert.equal((await upload(Buffer.from('%PDF-1.4 missing trailer'),'x.pdf')).status,400);
 assert.equal((await upload(original)).status,201);
 const first=db.prepare('SELECT * FROM cv_documents').get();assert.equal(first.original_name,'Original CV.pdf');
 assert.equal(db.prepare('SELECT active_document_id FROM cv_configuration').get().active_document_id,first.id);
 assert.equal((await fetch(filesUrl+'/api/integrations/v1/files/'+first.remote_id+'/download')).status,401);
 const remote=await fetch(filesUrl+'/api/integrations/v1/files/'+first.remote_id+'/download',{headers:{Authorization:'Bearer '+'t'.repeat(64)}});assert.deepEqual(Buffer.from(await remote.arrayBuffer()),original);
 for(const action of ['preview','download']){assert.equal((await request(`/admin/cv-management/${first.id}/${action}`)).status,303);const r=await request(`/admin/cv-management/${first.id}/${action}`,{headers:{cookie}});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),original);}
 assert.match(await(await request('/admin/cv-management',{headers:{cookie}})).text(),/Original CV.pdf/);
 const formData={name:'Jane Smith',email:'jane@example.com',company:'Example Recruitment',message:'Role discussion'};
 assert.equal((await request('/api/cv-request',form(formData))).status,200);
 const item=db.prepare('SELECT * FROM cv_requests WHERE email=?').get(formData.email);
 assert.equal(item.review_status,'pending');assert.equal(item.delivery_status,'emailed');
 const notify=emails().at(-1);assert.equal(notify.to,'febroherdyanto@outlook.com');assert.equal(notify.subject,"Febro Herdyanto's CV Request #00001");assert.match(notify.html,/<table role="presentation"/);
 const noCSRF=await request(`/admin/cv-requests/${item.id}/approve`,form({},cookie));assert.equal(noCSRF.status,403);
 const approved=await request(`/admin/cv-requests/${item.id}/approve`,form({_csrf:csrf},cookie));assert.equal(approved.status,303);
 const updated=db.prepare('SELECT * FROM cv_requests WHERE id=?').get(item.id);assert.equal(updated.review_status,'approved');assert.ok(updated.token_expires_at-Date.now()>70*3600*1000);
 const recipient=emails().at(-1);assert.equal(recipient.to,'jane@example.com');assert.equal(recipient.subject,"Febro Herdyanto's CV Request #00001");
 const url=recipient.html.match(/href="(https:\/\/febro\.id\/cv\/download\/[a-f0-9]{64})"/)[1];const token=url.split('/').pop();
 assert.equal(crypto.createHash('sha256').update(token).digest('hex'),updated.token_hash);
 const pdf=await request('/cv/download/'+token);assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),original);
 const secondBytes=Buffer.from('%PDF-1.7\nReplacement document\n%%EOF\n');assert.equal((await upload(secondBytes,'Replacement.pdf')).status,201);
 assert.deepEqual(Buffer.from(await(await request('/cv/download/'+token)).arrayBuffer()),original);
 assert.equal((await request(`/admin/cv-management/${first.id}/activate`,form({_csrf:csrf},cookie))).status,303);assert.equal(db.prepare('SELECT active_document_id FROM cv_configuration').get().active_document_id,first.id);
 db.prepare('UPDATE cv_requests SET token_expires_at=? WHERE id=?').run(Date.now()-1,item.id);assert.equal((await request('/cv/download/'+token)).status,410);
 db.prepare('UPDATE cv_requests SET token_expires_at=? WHERE id=?').run(Date.now()+3600000,item.id);
 assert.equal((await request('/cv/download/'+'a'.repeat(64))).status,410);
 // Legacy approved links bind once and preserve existing token and expiration.
 db.prepare('UPDATE cv_requests SET cv_document_id=NULL WHERE id=?').run(item.id);assert.deepEqual(Buffer.from(await(await request('/cv/download/'+token)).arrayBuffer()),original);assert.equal(db.prepare('SELECT cv_document_id FROM cv_requests WHERE id=?').get(item.id).cv_document_id,first.id);
 assert.equal((await request('/admin/cv-management/settings',form({_csrf:csrf,hours:'24'},cookie))).status,303);assert.equal((await request('/api/cv-request',form(formData))).status,503);
 assert.equal((await request('/cv/download/'+token)).status,200);
 assert.equal((await request('/admin/cv-management/settings',form({_csrf:csrf,hours:'24',enabled:'1'},cookie))).status,303);
 assert.equal((await request('/cv.pdf')).status,404);
 assert.equal((await request(`/admin/cv-requests/${item.id}/revoke`,form({_csrf:csrf},cookie))).status,303);
 assert.equal((await request('/cv/download/'+token)).status,410);
 fs.writeFileSync(path.join(svc.dir,'fail'),'1');await request(`/admin/cv-requests/${item.id}/approve`,form({_csrf:csrf},cookie));assert.equal(db.prepare('SELECT review_status FROM cv_requests WHERE id=?').get(item.id).review_status,'email_failed');fs.unlinkSync(path.join(svc.dir,'fail'));
 db.prepare('UPDATE cv_configuration SET active_document_id=NULL').run();await request(`/admin/cv-requests/${item.id}/approve`,form({_csrf:csrf},cookie));assert.notEqual(db.prepare('SELECT review_status FROM cv_requests WHERE id=?').get(item.id).review_status,'approved');
});
test('Contact form sends HTML notification and saves private record',async()=>{
 const message={name:'Contact Tester',email:'contact@example.com',phone:'+6281234567890',message:'Hello, I am interested in collaborating on a digital engineering project.'};
 const response=await request('/api/contact',form(message));assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
 const record=db.prepare('SELECT * FROM contact_messages WHERE email=?').get(message.email);assert.equal(record.delivery_status,'emailed');
 const notice=emails().at(-1);assert.equal(notice.to,'febroherdyanto@outlook.com');assert.match(notice.html,/Hello, I am interested/);
 const inbox=await request('/admin/contact-messages',{headers:{cookie}});assert.equal(inbox.status,200);assert.match(await inbox.text(),/Contact Tester/);
});
test('Admin controls category sections: create, move, assign, rename; no private detail CTA',async()=>{
 const add=await request('/admin/project-categories/add',form({_csrf:csrf,name:'Independent Studio'},cookie));assert.equal(add.status,303);
 let cats=db.prepare('SELECT * FROM project_categories ORDER BY sort_order,id').all();const id=cats.find(x=>x.name==='Independent Studio')?.id;assert.ok(id);
 const project=db.prepare("SELECT * FROM entries WHERE kind='project' AND slug='voltlab'").get();
 const save=await request('/admin/content/save',form({_csrf:csrf,kind:'project',id:String(project.id),title:project.title,slug:project.slug,category:'Independent Studio',access_mode:'view_only',enabled:'1'},cookie));assert.equal(save.status,303);
 let page=await(await request('/portfolio')).text();assert.match(page,/id="category-\d+"/);assert.match(page,/Independent Studio/);assert.doesNotMatch(page,/Overview only · No public detail/);
 const before=cats.findIndex(x=>x.id===id);const move=await request('/admin/project-categories/move',form({_csrf:csrf,id:String(id),direction:'up'},cookie));assert.equal(move.status,303);
 cats=db.prepare('SELECT * FROM project_categories ORDER BY sort_order,id').all();assert.equal(cats.findIndex(x=>x.id===id),before-1);
 const renamed=await request('/admin/project-categories/rename',form({_csrf:csrf,id:String(id),name:'Open Engineering'},cookie));assert.equal(renamed.status,303);
 assert.equal(db.prepare('SELECT category FROM entries WHERE id=?').get(project.id).category,'Open Engineering');
 assert.equal((await request('/portfolio/voltlab')).status,404);
});
test('Tools filtering has a reliable [hidden] CSS rule and modal implementation',async()=>{
 const css=await(await request('/app.css')).text();assert.match(css,/\[hidden\]\{display:none!important\}/);assert.match(css,/z-index:9999!important/);
 const html=await(await request('/tools')).text();assert.match(html,/data-category="IT"/);assert.match(html,/data-category="Electricity"/);
 const js=await(await request('/app.js')).text();assert.match(js,/document\.body\.appendChild\(toolModal\)/);
});
