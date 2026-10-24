'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const media=require('../media-client');
test('supported roles include certificate and cover',()=>{assert.equal(media.roles.has('certificate'),true);assert.equal(media.roles.has('cover'),true)});
test('service token is required',async()=>{const original=process.env.FEBRO_PROFILE_SERVICE_TOKEN;delete process.env.FEBRO_PROFILE_SERVICE_TOKEN;await assert.rejects(media.remote('GET','/api/integrations/v1/files/none'),/not configured/);if(original)process.env.FEBRO_PROFILE_SERVICE_TOKEN=original});

test('legacy grant migration preserves preview-only, download-only and disabled scopes',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-grants-'));const run=code=>spawnSync(process.execPath,['-e',code],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DATA_DIR:dir},encoding:'utf8'});
 try{
 const setup=run(`const {db}=require('./db');const entry=db.prepare('SELECT id FROM entries LIMIT 1').get().id;db.exec('ALTER TABLE access_items DROP COLUMN grant_preview; ALTER TABLE access_items DROP COLUMN grant_download');const request=Number(db.prepare("INSERT INTO access_requests(name,email,phone,reason,ip_hash,status,expires_at) VALUES('Legacy','test@example.com','12345678','Test','test','approved',9999999999999)").run().lastInsertRowid);for(const [index,preview,download] of [[1,0,0],[2,0,1],[3,1,0]]){const id=Number(db.prepare("INSERT INTO entry_files(entry_id,remote_id,role,original_name,mime_type,byte_size,requestable,allow_preview,allow_download) VALUES(?,?,'document','legacy.pdf','application/pdf',10,1,?,?)").run(entry,'legacy-'+index,preview,download).lastInsertRowid);db.prepare('INSERT INTO access_items(request_id,file_id,approved) VALUES(?,?,1)').run(request,id);}db.close();`);assert.equal(setup.status,0,setup.stderr);
 const migration=run(`const {db}=require('./db');console.log(JSON.stringify(db.prepare('SELECT grant_preview,grant_download FROM access_items ORDER BY file_id').all()));db.close();`);assert.equal(migration.status,0,migration.stderr);assert.deepEqual(JSON.parse(migration.stdout),[{grant_preview:0,grant_download:0},{grant_preview:0,grant_download:1},{grant_preview:1,grant_download:0}]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
