'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {dashboardContent}=require('../admin-dashboard')({esc:s=>String(s??'').replaceAll('<','&lt;'),icon:()=>'',adminKinds:{}});
test('dashboard aggregates recorded media, CV, content and request data without mutation',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE entries(id INTEGER,kind TEXT,enabled INTEGER);CREATE TABLE entry_files(entry_id INTEGER,byte_size INTEGER);CREATE TABLE cv_documents(byte_size INTEGER);CREATE TABLE access_requests(id INTEGER,name TEXT,status TEXT,created_at TEXT);CREATE TABLE cv_requests(id INTEGER,name TEXT,review_status TEXT,created_at TEXT);CREATE TABLE contact_messages(id INTEGER,name TEXT,is_read INTEGER,created_at TEXT);
 INSERT INTO entries VALUES(1,'project',1),(2,'project',0),(3,'certification',1),(4,'certification',0);INSERT INTO entry_files VALUES(1,1024),(3,2048),(3,1024);INSERT INTO cv_documents VALUES(4096);
 INSERT INTO access_requests VALUES(1,'<visitor>','pending','2026-10-24 10:00:00'),(2,'Approved visitor','approved','2026-10-24 11:00:00');INSERT INTO cv_requests VALUES(3,'CV visitor','pending','2026-10-25 11:00:00');INSERT INTO contact_messages VALUES(1,'Contact visitor',0,'2026-10-25 12:00:00');`);
 const before=db.prepare('SELECT total_changes() n').get().n;
 const html=dashboardContent(db);
 for(const text of ['Total projects</dt><dd>2','Published</dt><dd>1','Certifications</dt><dd>2','With files</dt><dd>1','Total files</dt><dd>4','8.0 KB','&lt;visitor>','CV visitor','Contact visitor','pending-count">2'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('Contact visitor')<html.indexOf('&lt;visitor>'));assert.equal(db.prepare('SELECT total_changes() n').get().n,before);db.close();
});
