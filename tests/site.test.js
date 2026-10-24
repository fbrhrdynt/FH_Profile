'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const srv=net.createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const p=srv.address().port;await new Promise(r=>srv.close(r));return p;}
async function start(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fh-site-test-')),port=await freePort();const proc=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;for(let i=0;i<60;i++){try{const r=await fetch(base+'/health');if(r.ok)return {dir,proc,base};}catch{}await sleep(75);}proc.kill();throw Error('Server did not start');}
async function req(base,route,opts={}){return fetch(base+route,{redirect:'manual',...opts});}
let srv;
test.before(async()=>{srv=await start();});
test.after(()=>{srv.proc.kill('SIGTERM');fs.rmSync(srv.dir,{recursive:true,force:true});});
test('public pages and metadata render',async()=>{for(const route of ['/','/posts','/portfolio','/tools','/about','/cv','/contact']){const r=await req(srv.base,route);assert.equal(r.status,200,route);const html=await r.text();assert.match(html,/<title>/);assert.match(html,/Febro Herdyanto/);assert.match(html,/site-header/);assert.match(html,/https:\/\/febro\.id/);}const r=await req(srv.base,'/unknown');assert.equal(r.status,404);});
test('tools are lightweight modal utilities and the Automation menu is removed',async()=>{const r=await req(srv.base,'/tools');const html=await r.text();assert.match(html,/data-open-tool="ip-calculator"/);assert.match(html,/data-open-tool="three-phase-power"/);assert.match(html,/id="tool-modal"/);assert.doesNotMatch(html,/href="\/tools\/ip-calculator"/);const home=await(await req(srv.base,'/')).text();assert.doesNotMatch(home,/<a href="\/automation"/);const old=await req(srv.base,'/tools/ip-calculator');assert.equal(old.status,303);});
test('search avoids exposing view-only portfolio detail and lists previews',async()=>{const privateSearch=await(await req(srv.base,'/api/search?q=DWM')).json();assert.ok(!privateSearch.some(x=>x.label.startsWith('DWM')));const publicSearch=await(await req(srv.base,'/api/search?q=VoltLab')).json();assert.ok(publicSearch.some(x=>x.label.includes('VoltLab')));});
test('CV uses request flow, without public PDF download',async()=>{const r=await req(srv.base,'/cv');const html=await r.text();assert.match(html,/CV currently unavailable/);assert.match(html,/id="cv-request-form"/);assert.equal((await req(srv.base,'/cv.pdf')).status,404);
 const form=new URLSearchParams({name:'Jane Recruiter',email:'jane@example.com',company:'Example Limited',message:'Recruitment opportunity'});
 const request=await req(srv.base,'/api/cv-request',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});assert.equal(request.status,503);assert.match((await request.json()).error,/unavailable/);assert.equal((await req(srv.base,'/app.css')).status,200);});

test('company portfolio is view only; public app projects can preview',async()=>{const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(path.join(srv.dir,'profile.sqlite'));
 d.prepare("UPDATE entries SET company='Restricted Company',access_mode='view_only' WHERE kind='project' AND slug='voltlab'").run();
 let html=await(await req(srv.base,'/portfolio')).text();assert.doesNotMatch(html,/Overview only · No public detail/);assert.match(html,/project-static/);assert.equal((await req(srv.base,'/portfolio/voltlab')).status,404);
 d.prepare("UPDATE entries SET company='',access_mode='external' WHERE kind='project' AND slug='voltlab'").run();
 html=await(await req(srv.base,'/portfolio')).text();assert.match(html,/https:\/\/voltlab.febro.id/);assert.equal((await req(srv.base,'/portfolio/voltlab')).status,404);
 d.prepare("UPDATE entries SET access_mode='detail' WHERE kind='project' AND slug='voltlab'").run();
 assert.equal((await req(srv.base,'/portfolio/voltlab')).status,200);d.close();});
test('admin authentication, CSRF, content create and visibility',async()=>{
 const { DatabaseSync }=require('node:sqlite');const db=new DatabaseSync(path.join(srv.dir,'profile.sqlite'));
 const {hashPassword}=require('../scripts');db.prepare('INSERT INTO admins(email,password_hash) VALUES (?,?)').run('admin@example.com',hashPassword('temporary-test-password'));
 assert.equal((await req(srv.base,'/admin')).status,303);
 const login=await req(srv.base,'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'admin@example.com',password:'temporary-test-password'})});
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('fh_admin='));
 const a=await req(srv.base,'/admin',{headers:{cookie}});assert.equal(a.status,200);const html=await a.text();assert.match(html,/Overview/);const csrf=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
 const noCSRF=await req(srv.base,'/admin/content/save',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({kind:'post',title:'Missing CSRF'})});assert.equal(noCSRF.status,403);
 const save=await req(srv.base,'/admin/content/save',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,kind:'post',title:'A Verified Test Post',description:'Created through admin.',body:'## Hello',enabled:'1',category:'Test'})});assert.equal(save.status,303);
 const publicPost=await req(srv.base,'/posts/a-verified-test-post');assert.equal(publicPost.status,200);assert.match(await publicPost.text(),/Created through admin/);
 const del=await req(srv.base,'/admin/content/'+db.prepare("SELECT id FROM entries WHERE slug='a-verified-test-post'").get().id+'/delete',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf})});assert.equal(del.status,303);assert.equal((await req(srv.base,'/posts/a-verified-test-post')).status,404);
 db.close();
});

// PM2 can load application source with require(), so the server must listen even if require.main !== module.
test('server starts when loaded through a PM2-style require entrypoint',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fh-pm2-require-test-'));
 const port=await freePort();
 const child=spawn(process.execPath,['-e',"require('./server.js')"],{cwd:ROOT,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:'ignore'});
 try{
  let ok=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok){ok=true;break;}}catch{}
   await sleep(75);
  }
  assert.equal(ok,true,'server must listen even if loaded by require()');
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>child.once('exit',resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('CV Management upload script is served with executable MIME type',async()=>{const r=await req(srv.base,'/cv-management.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.match(await r.text(),/X-CSRF-Token/);});
