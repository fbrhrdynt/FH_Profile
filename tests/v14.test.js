'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn}=require('node:child_process');const {DatabaseSync}=require('node:sqlite');
const ROOT=path.resolve(__dirname,'..');
async function port(){const srv=net.createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const num=srv.address().port;await new Promise(r=>srv.close(r));return num;}
let svc;
async function request(route,options={}){return fetch(svc.url+route,{redirect:'manual',...options});}
function form(params,cookie){return {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie}:{})},body:new URLSearchParams(params)};}
let db,csrf,cookie;
test.before(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fh-v14-flow-'));const p=await port();const log=path.join(dir,'emails.jsonl');
 const child=spawn(process.execPath,['--require','./tests/mock-nodemailer.cjs','server.js'],{cwd:ROOT,env:{...process.env,DATA_DIR:dir,PORT:String(p),HOST:'127.0.0.1',APP_URL:'https://febro.id',SMTP_HOST:'smtp.hostinger.com',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'info@logisourcedigital.web.id',SMTP_PASS:'example-only',SMTP_FROM:'Febro Herdyanto <info@logisourcedigital.web.id>',CV_ADMIN_EMAIL:'febroherdyanto@outlook.com',CV_LINK_TTL_HOURS:'72',FH_MAIL_TEST_LOG:log},stdio:'ignore'});
 svc={dir,child,log,url:'http://127.0.0.1:'+p};let started=false;
 for(let i=0;i<70;i++){try{if((await request('/health')).ok){started=true;break}}catch{}await new Promise(r=>setTimeout(r,60));}
 if(!started)throw Error('Test server did not start');
 db=new DatabaseSync(path.join(dir,'profile.sqlite'));
 const {hashPassword}=require('../scripts');db.prepare('INSERT INTO admins(email,password_hash) VALUES (?,?)').run('admin@example.com',hashPassword('secure-test-only-password'));
 const login=await request('/admin/login',form({email:'admin@example.com',password:'secure-test-only-password'}));
 assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
 const html=await (await request('/admin',{headers:{cookie}})).text();csrf=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
});
test.after(async()=>{db?.close();svc?.child.kill('SIGTERM');if(svc){await new Promise(r=>svc.child.once('exit',r));fs.rmSync(svc.dir,{recursive:true,force:true});}});
const emails=()=>fs.existsSync(svc.log)?fs.readFileSync(svc.log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
test('CV request → HTML admin email → approve → email temporary PDF → revoke',async()=>{
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
 const pdf=await request('/cv/download/'+token);assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);assert.equal((await pdf.arrayBuffer()).byteLength>1000,true);
 assert.equal((await request('/cv.pdf')).status,404);
 assert.equal((await request(`/admin/cv-requests/${item.id}/revoke`,form({_csrf:csrf},cookie))).status,303);
 assert.equal((await request('/cv/download/'+token)).status,410);
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
