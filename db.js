'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, {recursive:true,mode:0o700});
const db = new DatabaseSync(path.join(DATA_DIR, 'profile.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, slug TEXT NOT NULL,
 title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 body TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
 company TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', period TEXT NOT NULL DEFAULT '',
 url TEXT NOT NULL DEFAULT '', featured INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
 views INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(kind,slug)
);
CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries(kind, enabled, featured);
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
`);
// Additive attachment references for future Febro Files integration.
// Private by default; no actual file storage or public serving is enabled.
db.exec(`CREATE TABLE IF NOT EXISTS entry_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
 remote_id TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('cover','gallery','document','certificate','attachment')),
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL,
 sha256 TEXT NOT NULL DEFAULT '',
 caption TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','unlisted','private')),
 allow_preview INTEGER NOT NULL DEFAULT 0,
 allow_download INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entry_files_entry ON entry_files(entry_id,sort_order,id);`);
// Backward-compatible v1.3 migrations. Existing content, uploads and admin sessions remain intact.
const cols=db.prepare('PRAGMA table_info(entries)').all().map(c=>c.name);
if(!cols.includes('access_mode'))db.exec("ALTER TABLE entries ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'view_only'");
db.exec(`CREATE TABLE IF NOT EXISTS cv_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,email TEXT NOT NULL,company TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',
 ip_hash TEXT NOT NULL, delivery_status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cv_requests_ip ON cv_requests(ip_hash,created_at);`);
// Additive migration only: no existing CV requests or portfolio entries are removed.
const cvColumns=new Set(db.prepare('PRAGMA table_info(cv_requests)').all().map(c=>c.name));
for(const [name,sql] of Object.entries({
 review_status:"TEXT NOT NULL DEFAULT 'pending'",
 token_hash:"TEXT NOT NULL DEFAULT ''",
 token_expires_at:'INTEGER NOT NULL DEFAULT 0',
 reviewed_at:"TEXT NOT NULL DEFAULT ''",
 sent_at:"TEXT NOT NULL DEFAULT ''"
}))if(!cvColumns.has(name))db.exec(`ALTER TABLE cv_requests ADD COLUMN ${name} ${sql}`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cv_tokens ON cv_requests(token_hash);
CREATE TABLE IF NOT EXISTS contact_messages(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',message TEXT NOT NULL,
 ip_hash TEXT NOT NULL,delivery_status TEXT NOT NULL DEFAULT 'pending',
 is_read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contact_rate ON contact_messages(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS project_categories(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
// Carry forward all pre-existing category labels; seed Open Source and Corporate.
const catInsert=db.prepare('INSERT OR IGNORE INTO project_categories(name,sort_order) VALUES (?,?)');
for(const [name,order] of [['Open Source',10],['Corporate',20]])catInsert.run(name,order);
let nextOrder=30;
for(const r of db.prepare("SELECT DISTINCT category FROM entries WHERE kind='project' AND trim(category)<>'' ORDER BY category").all()){
 if(!db.prepare('SELECT id FROM project_categories WHERE name=? COLLATE NOCASE').get(r.category))catInsert.run(r.category,nextOrder+=10);
}

// Give existing public demo projects the least-privilege portfolio behavior.
// Preserve any modes already selected by an administrator.
const modeSeed=db.prepare("SELECT value FROM settings WHERE key='portfolio_modes_v13'").get();
if(!modeSeed){
 db.exec("UPDATE entries SET access_mode='external' WHERE kind='project' AND company='' AND url LIKE 'https://%' AND category NOT LIKE '%corporate%'");
 db.exec("UPDATE entries SET access_mode='view_only' WHERE kind='project' AND (company<>'' OR url='' OR slug='dwm')");
 db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('portfolio_modes_v13','1')").run();
}
const seedSettings = {
  site_name:'Febro Herdyanto', site_tagline:'Maintenance · Technology · Automation',
  hero_roles:'Industrial Maintenance | Software Development | Automation',
  hero_description:'Maintenance professional and technology enthusiast with hands-on experience in industrial equipment, troubleshooting, PLC systems, and building practical digital solutions.',
  intro_terminal:'febro@workspace:~$ whoami',
  about_description:'My background is in industrial maintenance, with experience supporting workshop operations, preventive and corrective maintenance, equipment inspection, and commissioning. Alongside that work, I develop software and automation tools that solve real operational problems.',
  location:'Bekasi, Indonesia',
  availability:'Open to opportunities and collaboration',
  email:'info@logisourcedigital.web.id', github:'https://github.com/fbrhrdynt',linkedin:'', website:'https://febro.id', avatar:'',
  years_label:'8+', footer_note:'Built with Node.js · SQLite · PM2',
  cv_summary:'Maintenance professional experienced in industrial equipment preventive and corrective maintenance, function testing, commissioning, HMI/PLC troubleshooting, digital inspection solutions, and software development.',
  accent:'#2461d5',
  skills_json:JSON.stringify({
    'industrial & maintenance':['Preventive Maintenance','Corrective Maintenance','Equipment Inspection','Commissioning','Troubleshooting','CMMS / Maximo'],
    'electrical & controls':['Siemens PLC','HMI','VFD','UPS','Industrial Electrical','Instrumentation'],
    'software & web':['Node.js','JavaScript','React','PHP','SQLite','MySQL','REST API'],
    'infrastructure':['Ubuntu Linux','Nginx','PM2','Git / GitHub','VPS Administration'],
    'automation & tools':['Power Platform','Raspberry Pi','ESP32','Google Sheets Integration']
  })
};
const setDefault=db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
for (const [k,v] of Object.entries(seedSettings)) setDefault.run(k,v);
const insert=db.prepare(`INSERT OR IGNORE INTO entries(kind,slug,title,subtitle,description,body,tags,category,company,year,period,url,featured,enabled)
 VALUES(@kind,@slug,@title,@subtitle,@description,@body,@tags,@category,@company,@year,@period,@url,@featured,@enabled)`);
function add(kind,slug,title,description,opts={}) {insert.run({kind,slug,title,description,subtitle:opts.subtitle||'',body:opts.body||'',tags:opts.tags||'',category:opts.category||'',company:opts.company||'',year:opts.year||'',period:opts.period||'',url:opts.url||'',featured:opts.featured?1:0,enabled:opts.enabled===false?0:1});}
// Starter content is sourced from the site owner's previously described projects and experience.
add('project','logisource-digital','LogiSource Digital','A growing collection of operational software, digital products and tools developed under the LogiSource Digital brand.',{category:'Product ecosystem',tags:'Node.js,Web Apps,Automation',year:'2026',featured:true,url:'https://logisourcedigital.web.id'});
add('project','dwm','DWM — Drilling Waste Management','A modern operations reporting system with project assignment, reporting workflows, asset management, validation and PDF output.',{category:'Industrial software',tags:'Node.js,SQLite,Reports',year:'2026',featured:true,url:'https://dwm.logisourcedigital.web.id'});
add('project','cabinex','Cabinex — LS Inventory Central','Centralized multi-client equipment inventory with asset tracking, device integrations and auditable transactions.',{category:'IoT & inventory',tags:'Raspberry Pi,NFC,QR,Node.js',year:'2026',featured:true,url:'https://webver.cabinex.logisourcedigital.web.id'});
add('project','voltlab','VoltLab — Electrical Learning','An electrical education platform focused on AC/DC learning, industrial components, calculation and interactive circuit simulation.',{category:'Education',tags:'Electrical,Simulation,Learning',year:'2026',featured:true});
add('project','asset-maintenance-tracker','AMT — Asset Maintenance Tracker','A maintenance-oriented digital product for tracking assets, inspections and maintenance activities.',{category:'Maintenance',tags:'Asset Tracking,Maintenance',year:'2026'});
add('project','receipt-generator-pro','Receipt Generator Pro','Generate and edit receipts with convenient templates, a guided generator and print-friendly output.',{category:'Productivity',tags:'React,Generator,Web App',year:'2026',url:'https://receipt.febro.id'});
add('project','ls-itinerary','LS Itinerary','A collaborative trip planning platform featuring shared itineraries, budgets, roles and trip management.',{category:'Web application',tags:'Node.js,Collaboration,Travel',year:'2026',url:'https://itinerary.febro.id'});
add('project','ls-server-health','LS Server Health','Web dashboard for monitoring VPS resources, services, projects, and operational status.',{category:'Infrastructure',tags:'Linux,PM2,Nginx,Monitoring',year:'2026',url:'https://health.febro.id'});
add('project','ls-inventory','LS Inventory — Smart Cabinet','Raspberry Pi–based inventory station supporting camera-based QR scan, NFC and transaction tracking.',{category:'Hardware & IoT',tags:'Raspberry Pi,IoT,QR,NFC',year:'2026'});
add('automation','workshop-digital-inspection','Workshop Digital Inspection','Digitizing workshop checks and inspection workflows to make operational data easier to collect and review.',{category:'Workflow',tags:'Power Platform,Inspection,Maintenance',year:'2026'});
add('automation','smart-inventory-workflow','Smart Inventory Workflow','Linking QR/NFC scans to inventory transaction records, with device and backend integration.',{category:'IoT',tags:'Raspberry Pi,NFC,Node.js',year:'2026'});
add('automation','server-health-monitoring','Server Health Monitoring','Centralizing VPS service status and resource indicators for ongoing administration.',{category:'Infrastructure',tags:'Ubuntu,PM2,Monitoring',year:'2026'});
add('post','building-a-personal-project-ecosystem','Building a Practical Project Ecosystem','A look at why I build small, purpose-driven digital tools for maintenance, operations and everyday problems.',{category:'Development',tags:'Projects,Node.js,Automation',year:'2026',body:'## Why build tools?\n\nI enjoy turning recurring operational problems into simple digital workflows. Instead of adding complexity, I focus on useful, maintainable software.\n\n## Current directions\n\nFrom inventory workflows and maintenance tracking to personal productivity tools, each project starts with a real use case.\n\n## How I approach development\n\nStart small, validate the actual workflow, build with lightweight tools, and iterate based on feedback.\n\n*This starter article can be edited or unpublished in the admin dashboard.*',featured:true});
add('post','from-maintenance-to-software','From Industrial Maintenance to Software','How hands-on troubleshooting and workshop experience inform my approach to developing web applications.',{category:'Experience',tags:'Maintenance,Technology',year:'2026',body:'## Connecting two disciplines\n\nMaintenance and software development both benefit from understanding a problem before trying to fix it.\n\nWhether working on equipment or code, a good solution should be reliable, understandable and testable.\n\n*This starter article can be edited or unpublished in the admin dashboard.*'});
add('experience','maintenance-associate','Maintenance Associate','Preventive and corrective maintenance, inspection, function tests, commissioning and equipment troubleshooting for industrial workshop operations.',{company:'SLB / M-I SWACO',period:'Jul 2022 – Sep 2026',year:'2022',tags:'Maintenance,PLC,HMI,Maximo',body:'Performed preventive and corrective maintenance on workshop equipment.\nSupported function tests, commissioning, inspections and troubleshooting.\nWorked with Siemens PLC, HMI, VFD, UPS and digital inspection workflows.'});
add('experience','maintenance-assistant','Maintenance Assistant','Supported industrial equipment maintenance and workshop operations.',{company:'M-I SWACO',period:'Feb 2020 – Jul 2022',year:'2020',body:'Supported preventative maintenance and equipment repair activities.\nAssisted with diagnostics and workshop documentation.'});
add('experience','workshop-helper','Workshop Helper','Supported field equipment workshop activities and operational maintenance teams.',{company:'PT Supraco Indonesia',period:'Sep 2017 – Feb 2020',year:'2017'});
add('experience','computer-lab-technician','Computer Lab Technician','Maintained computer lab devices and provided technical support.',{company:'SMKN 1 Mejayan',period:'Jul 2016 – Aug 2017',year:'2016'});
add('education','informatics-engineering','Bachelor of Informatics Engineering','GPA 3.89 / 4.00',{company:'Universitas Pelita Bangsa',period:'Sep 2020 – Aug 2024',year:'2024'});
add('certification','treating-equipment-inspector','Treating Equipment Inspector','Technical equipment inspection certification.',{company:'Technical certification'});
// All listed tools are implemented locally, rather than advertised as non-functional placeholders.
const tools=[
 ['ip-calculator','IP / Subnet Calculator','Calculate IPv4 network information from CIDR notation.','Network'],
 ['dns-records','DNS Records Guide','Understand common DNS records and examples.','Network'],
 ['http-status','HTTP Status Reference','Quick lookup of HTTP response status codes.','Network'],
 ['url-encoder','URL Encoder / Decoder','Encode and decode URL values safely.','Network'],
 ['base64','Base64 Encoder / Decoder','Convert text to and from Base64.','Security'],
 ['json-formatter','JSON Formatter & Validator','Pretty print, minify and validate JSON.','DevOps'],
 ['jwt-decoder','JWT Decoder','Inspect JWT header and payload locally (no verification).','Security'],
 ['sha256','SHA-256 Hash','Compute SHA-256 in your browser.','Security'],
 ['password-generator','Password Generator','Generate strong random passwords securely in-browser.','Security'],
 ['uuid-generator','UUID Generator','Generate RFC 4122 UUID v4 identifiers.','DevOps'],
 ['unix-timestamp','Unix Timestamp Converter','Convert between Unix time and human-readable dates.','DevOps'],
 ['cron-helper','Cron Expression Helper','Create and understand simple recurring schedules.','DevOps'],
 ['nginx-generator','Nginx Server Block','Generate a reverse-proxy Nginx configuration.','Server'],
 ['pm2-generator','PM2 Ecosystem Generator','Generate a basic PM2 process configuration.','Server'],
 ['systemd-generator','Systemd Service Generator','Generate a systemd unit for Node.js or other commands.','Server'],
 ['ufw-generator','UFW Rule Generator','Generate Ubuntu firewall commands.','Server'],
 ['ssh-command','SSH Command Builder','Construct SSH connections with custom ports and keys.','Server'],
 ['gitignore-generator','.gitignore Generator','Create .gitignore contents from project presets.','DevOps'],
 ['text-tools','Text Analyzer','Count words, characters, sentences and lines.','Utilities'],
 ['slug-generator','Slug Generator','Convert titles into URL-friendly slugs.','DevOps'],
 ['color-converter','Color Converter','Convert between HEX and RGB colors.','DevOps'],
 ['chmod-calculator','Chmod Calculator','Convert Unix permission notation to chmod values.','Server'],
 ['random-number','Random Number Generator','Generate random integers within a range.','Utilities'],
 ['regex-tester','Regex Tester','Test JavaScript regular expressions against sample text.','DevOps'],
 ['url-parser','URL Parser','Break a URL into host, path, query and protocol.','Network'],
 ['ipv4-binary','IPv4 Binary Converter','Convert IPv4 octets between decimal and binary.','Network'],
 ['ip-range-checker','CIDR Range Checker','Check whether an IPv4 address belongs to a given subnet.','Network'],
 ['port-reference','Port Reference','Look up standard network service port numbers.','Network'],
 ['mac-formatter','MAC Address Formatter','Normalize and check network adapter MAC addresses.','Network'],
 ['dns-zone-generator','DNS Zone Record Builder','Generate common DNS A, CNAME, MX and TXT records.','Network'],
 ['apache-vhost-generator','Apache Virtual Host Generator','Generate an Apache reverse proxy vhost.','Server'],
 ['htaccess-generator','.htaccess Generator','Generate Apache redirects and common hardening rules.','Server'],
 ['dockerfile-generator','Dockerfile Generator','Create a Dockerfile for common application stacks.','DevOps'],
 ['docker-compose-generator','Docker Compose Generator','Generate a small Docker Compose service definition.','DevOps'],
 ['kubernetes-manifest','Kubernetes Manifest Generator','Generate a Deployment and Service manifest.','DevOps'],
 ['github-actions-workflow','GitHub Actions Workflow','Generate a basic Node.js CI workflow.','DevOps'],
 ['ansible-playbook-generator','Ansible Playbook Generator','Generate a basic Linux package installation playbook.','DevOps'],
 ['security-headers-generator','Security Headers Generator','Build production-minded HTTP security headers.','Security'],
 ['csp-generator','CSP Builder','Generate a Content Security Policy for a website.','Security'],
 ['password-strength','Password Strength Estimator','Review password structure with a local heuristic.','Security'],
 ['html-escape','HTML Escape / Unescape','Encode or decode HTML special characters.','Security']
];
for (const [slug,title,description,category] of tools) add('tool',slug,title,description,{category,featured:slug==='ip-calculator'});
// Public demo for VoltLab, while still honoring later admin access-mode choices.
if(!db.prepare("SELECT value FROM settings WHERE key='voltlab_url_v13'").get()){
 db.prepare("UPDATE entries SET url='https://voltlab.febro.id', access_mode='external' WHERE kind='project' AND slug='voltlab' AND url=''").run();
 db.prepare("INSERT INTO settings(key,value) VALUES ('voltlab_url_v13','1')").run();
}
// Ready-to-use electrical tools (no server API or third-party scripts needed).
for(const [slug,title,description] of [
 ['voltage-current','Ohm’s Law — Voltage & Current','Calculate volts from amps and resistance.'],
 ['ohms-law','Resistance Calculator','Calculate resistance from voltage and current.'],
 ['ac-power','Single-Phase AC Power','Active power, apparent power and reactive power.'],
 ['three-phase-power','Three-Phase Power','Estimate 3-phase kW, kVA, kVAR using line voltage.'],
 ['motor-current','Motor Full-Load Current','Estimate 1-phase or 3-phase motor current.'],
 ['voltage-drop','Voltage Drop Calculator','Estimate resistive voltage drop in copper conductors.'],
 ['energy-cost','Electricity Cost Calculator','Estimate kWh and electricity cost in IDR.']
])add('tool',slug,title,description,{category:'Electricity',enabled:true});
// Fresh installs seed entries after the migration block; register their categories too.
for(const r of db.prepare("SELECT DISTINCT category FROM entries WHERE kind='project' AND trim(category)<>'' ORDER BY category").all()){
 if(!db.prepare('SELECT id FROM project_categories WHERE name=? COLLATE NOCASE').get(r.category)){
  const max=db.prepare('SELECT COALESCE(MAX(sort_order),0) n FROM project_categories').get().n;
  catInsert.run(r.category,max+10);
 }
}
require('./portfolio-ecosystem').addEcosystemProjects(db);
const getSettings=()=>Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
const entries=(kind,enabled=true)=>db.prepare('SELECT * FROM entries WHERE kind=?'+(enabled?' AND enabled=1':'')+(['experience','education'].includes(kind)?' ORDER BY CAST(year AS INTEGER) DESC, id DESC':kind==='tool'?" ORDER BY CASE category WHEN 'Network' THEN 1 WHEN 'Server' THEN 2 WHEN 'DevOps' THEN 3 WHEN 'Security' THEN 4 ELSE 5 END, id ASC":' ORDER BY featured DESC, id DESC')).all(kind);
const getEntry=(kind,slug)=>db.prepare('SELECT * FROM entries WHERE kind=? AND slug=?').get(kind,slug);
module.exports={db, getSettings,entries,getEntry,DATA_DIR};
