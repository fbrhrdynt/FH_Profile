'use strict';
(()=>{
const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>Array.from(scope.querySelectorAll(selector));
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const updateTheme=()=>{const dark=document.documentElement.dataset.theme==='dark';$$('.theme-toggle').forEach(b=>b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode'));};
updateTheme();
$('.theme-toggle')?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('fh-theme',next);}catch{}updateTheme();});
$('.menu-toggle')?.addEventListener('click',()=>{const nav=$('#main-nav'),btn=$('.menu-toggle');nav?.classList.toggle('is-open');btn?.setAttribute('aria-expanded',nav?.classList.contains('is-open')?'true':'false');});
$$('#main-nav a').forEach(a=>a.addEventListener('click',()=>$('#main-nav')?.classList.remove('is-open')));
const sidebar=$('.admin-sidebar'),menuButton=$('.admin-menu-toggle'),backdrop=$('.admin-backdrop');
function closeAdminMenu(){sidebar?.classList.remove('is-open');document.body.classList.remove('admin-nav-open');menuButton?.setAttribute('aria-expanded','false');if(backdrop)backdrop.hidden=true;}
menuButton?.addEventListener('click',()=>{if(sidebar?.classList.contains('is-open'))return closeAdminMenu();sidebar?.classList.add('is-open');document.body.classList.add('admin-nav-open');menuButton.setAttribute('aria-expanded','true');if(backdrop)backdrop.hidden=false;$('.admin-sidebar-close')?.focus();});
backdrop?.addEventListener('click',()=>{closeAdminMenu();menuButton?.focus()});
$('.admin-sidebar-close')?.addEventListener('click',()=>{closeAdminMenu();menuButton?.focus()});
$$('.admin-sidebar a').forEach(a=>a.addEventListener('click',closeAdminMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar?.classList.contains('is-open')){closeAdminMenu();menuButton?.focus()}if(e.key==='Tab'&&sidebar?.classList.contains('is-open')){const controls=$$('a,button,summary',sidebar).filter(x=>x.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
window.matchMedia('(min-width:761px)').addEventListener('change',closeAdminMenu);

// Sitewide command search (client-friendly keyboard controls; results from own server).
const overlay=$('#search-overlay'),searchInput=$('#global-search'),results=$('#search-results');let searchAbort=null,searchTimer=null,highlightIndex=0;
const staticLinks=[{label:'Home',href:'/',kind:'Page',desc:'Welcome'},{label:'Blog',href:'/posts',kind:'Page',desc:'Read posts'},{label:'Portfolio',href:'/portfolio',kind:'Page',desc:'See projects'},{label:'Tools',href:'/tools',kind:'Page',desc:'Interactive tools'},{label:'About',href:'/about',kind:'Page',desc:'Profile and skills'},{label:'CV',href:'/cv',kind:'Page',desc:'Experience and education'},{label:'Contact',href:'/contact',kind:'Page',desc:'Get in touch'}];
function renderResults(items){if(!results)return;results.innerHTML=items.length?items.map((item,i)=>`<a class="search-result" href="${esc(item.href)}" data-index="${i}"><span class="search-result-label">// ${esc(item.kind)}</span><strong>${esc(item.label)}</strong><small>${esc(item.desc||'').slice(0,110)}</small></a>`).join(''):'<div class="empty-state">No matching results.</div>';highlightIndex=0;}
function openSearch(){if(!overlay)return;overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');renderResults(staticLinks);searchInput.value='';searchInput.focus();document.body.style.overflow='hidden';}
function closeSearch(){if(!overlay)return;overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');document.body.style.overflow='';searchAbort?.abort();}
$('.search-launch')?.addEventListener('click',openSearch);$('#search-close')?.addEventListener('click',closeSearch);overlay?.addEventListener('click',e=>{if(e.target===overlay)closeSearch();});
searchInput?.addEventListener('input',()=>{clearTimeout(searchTimer);const query=searchInput.value.trim().toLowerCase();if(!query)return renderResults(staticLinks);const local=staticLinks.filter(x=>[x.label,x.desc].join(' ').toLowerCase().includes(query));searchTimer=setTimeout(async()=>{searchAbort?.abort();searchAbort=new AbortController();try{const res=await fetch('/api/search?q='+encodeURIComponent(query),{signal:searchAbort.signal});const json=await res.json();renderResults([...local,...json]);}catch(e){if(e.name!=='AbortError')renderResults(local);}},170);});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}if(e.key==='Escape')closeSearch();if(!overlay?.classList.contains('is-open'))return;const a=$$('.search-result',results);if(!a.length)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();highlightIndex=(highlightIndex+(e.key==='ArrowDown'?1:-1)+a.length)%a.length;a[highlightIndex]?.focus();}if(e.key==='Enter'&&document.activeElement===searchInput){e.preventDefault();a[0].click();}});

// Reinitialize only page-specific controls after a partial navigation.
function initPage(){
const pageEvents=new AbortController();
const stopParticles=initParticles();
// Client-side content filtering and sorting.
const search=$('#collection-search'),collection=$('#filter-collection'),categories=$('#collection-categories');
if(collection){let category='all',sort='newest';const cards=()=>Array.from(collection.children);const refresh=()=>{const q=(search?.value||'').trim().toLowerCase();let count=0;cards().forEach(el=>{const matchText=(el.dataset.title||'').includes(q);const matchCat=category==='all'||el.dataset.category===category;el.hidden=!(matchText&&matchCat);if(!el.hidden)count++;});if($('#filter-empty'))$('#filter-empty').hidden=count>0;};search?.addEventListener('input',refresh);categories?.addEventListener('click',e=>{const btn=e.target.closest('button[data-category]');if(!btn)return;category=btn.dataset.category;$$('button',categories).forEach(b=>b.classList.toggle('active',b===btn));refresh();});$('#sort-posts')?.addEventListener('click',e=>{const btn=e.target.closest('[data-sort]');if(!btn)return;sort=btn.dataset.sort;$$('button',$('#sort-posts')).forEach(b=>b.classList.toggle('selected',b===btn));const order=cards().sort((a,b)=>sort==='popular'?Number(b.dataset.views)-Number(a.dataset.views):sort==='oldest'?Number(a.dataset.id)-Number(b.dataset.id):Number(b.dataset.id)-Number(a.dataset.id));order.forEach(el=>collection.appendChild(el));refresh();});}

// Profile image upload: base64 is used so the application needs no multipart dependency.
$('#avatar-upload')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1_500_000||!['image/jpeg','image/png','image/webp'].includes(file.type)){alert('Please choose JPG, PNG or WEBP image under 1.5 MB.');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{if($('#avatar-data'))$('#avatar-data').value=reader.result;const preview=$('.avatar-settings-preview');if(preview)preview.innerHTML=`<img class="small-avatar" alt="Profile image preview" src="${reader.result}">`;};reader.readAsDataURL(file);});

// Tool workspaces: each menu item produces an actual output without a server API call.
const toolModal=$('#tool-modal'),toolWorkspace=$('.tool-workspace',toolModal||document);
// Move modal outside .site-wrapper stacking context so the backdrop also covers the footer.
if(toolModal)document.body.appendChild(toolModal);
let modalReturnFocus=null;
function closeTool(){if(!toolModal)return;toolModal.classList.remove('is-open');toolModal.setAttribute('aria-hidden','true');document.body.classList.remove('has-modal');modalReturnFocus?.focus();}
$('#filter-collection')?.addEventListener('click',e=>{const button=e.target.closest('button[data-open-tool]');if(!button||!toolModal)return;
 modalReturnFocus=button;$('#tool-modal-title').textContent=button.dataset.toolTitle;$('#tool-modal-description').textContent=button.dataset.toolDesc;
 toolWorkspace.dataset.tool=button.dataset.openTool;toolModal.classList.add('is-open');toolModal.setAttribute('aria-hidden','false');document.body.classList.add('has-modal');
 mountTool(toolWorkspace);$('.tool-modal-close',toolModal)?.focus();
});
$('.tool-modal-close',toolModal||document)?.addEventListener('click',closeTool);
toolModal?.addEventListener('click',e=>{if(e.target===toolModal)closeTool();});
const cvModal=$('#cv-request-modal'),cvBtn=$('[data-open-cv-request]');
if(cvModal)document.body.appendChild(cvModal);
function closeCv(){if(!cvModal)return;cvModal.classList.remove('is-open');cvModal.setAttribute('aria-hidden','true');document.body.classList.remove('has-modal');cvBtn?.focus();}
cvBtn?.addEventListener('click',()=>{cvModal.classList.add('is-open');cvModal.setAttribute('aria-hidden','false');document.body.classList.add('has-modal');$('#cv-request-form [name=name]')?.focus();});
$('.cv-modal-close',cvModal||document)?.addEventListener('click',closeCv);
cvModal?.addEventListener('click',e=>{if(e.target===cvModal)closeCv();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTool();closeCv();}},{signal:pageEvents.signal});
// Contact form: inline feedback, no spinner, page reload, or full-screen loading overlay.
$('#contact-form')?.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,status=$('#contact-status'),btn=form.querySelector('[type=submit]');
 if(!form.reportValidity())return;
 btn.disabled=true;status.className='contact-status';status.textContent='Sending your message…';
 try{const res=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form))});const data=await res.json();if(!res.ok)throw Error(data.error||'Could not submit message');status.textContent=data.message||'Message received.';status.classList.add('is-success');form.reset();}
 catch(err){status.textContent=err.message;status.classList.add('is-error');}
 finally{btn.disabled=false;}
});
$('#cv-request-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,status=$('#cv-request-status'),btn=form.querySelector('[type=submit]');if(!form.reportValidity())return;btn.disabled=true;status.textContent='Submitting request…';try{const res=await fetch('/api/cv-request',{method:'POST',body:new URLSearchParams(new FormData(form)),headers:{'content-type':'application/x-www-form-urlencoded'}});const data=await res.json();if(!res.ok)throw Error(data.error||'Could not submit request');status.textContent=data.message||'Request received.';form.reset();}catch(err){status.textContent=err.message;}finally{btn.disabled=false;}});
function mountTool(workspace){
if(!workspace)return;
const slug=workspace.dataset.tool,inputs=$('#tool-inputs',workspace),output=$('#tool-output',workspace);
const fields={
 'ip-calculator':[['address','IPv4 address / CIDR','text','192.168.1.10/24']],
 'dns-records':[['record','Record type','select','A|AAAA|CNAME|MX|TXT|NS|SOA|CAA|SRV|PTR']],
 'http-status':[['code','HTTP status code','number','404']],
 'url-encoder':[['text','Text or URL','textarea','hello world & hello?']],
 'base64':[['text','Text to encode or Base64 to decode','textarea','Hello, world!']],
 'json-formatter':[['text','JSON input','textarea','{"name":"Febro","active":true,"projects":9}']],
 'jwt-decoder':[['text','JWT token (paste locally)','textarea','']],
 'sha256':[['text','Text to hash','textarea','Hello World']],
 'password-generator':[['length','Length (8 to 128)','number','20'],['symbols','Include symbols?','select','Yes|No']],
 'uuid-generator':[['count','How many UUIDs? (1–30)','number','5']],
 'unix-timestamp':[['text','Unix timestamp (seconds or milliseconds)','text',String(Math.floor(Date.now()/1000))]],
 'cron-helper':[['schedule','Frequency','select','Every minute|Every 5 minutes|Every 15 minutes|Hourly|Daily 09:00|Weekly Monday 09:00|Monthly first day']],
 'nginx-generator':[['domain','Domain name','text','example.com'],['port','Local application port','number','3090']],
 'pm2-generator':[['name','Process name','text','my-node-app'],['script','Script path','text','server.js'],['port','Port','number','3090']],
 'systemd-generator':[['name','Service name','text','my-app'],['cwd','Working directory','text','/opt/my-app'],['cmd','ExecStart command','text','/usr/bin/node /opt/my-app/server.js']],
 'ufw-generator':[['port','Port','number','3090'],['protocol','Protocol','select','tcp|udp|both'],['source','Allowed source (optional IPv4/CIDR)','text','']],
 'ssh-command':[['user','SSH username','text','ubuntu'],['host','Server IP or hostname','text','192.168.1.100'],['port','SSH port','number','2026'],['key','Identity file (optional)','text','']],
 'gitignore-generator':[['stack','Project stack','select','Node.js|Python|React|PHP|General']],
 'text-tools':[['text','Text','textarea','Every practical tool starts with a real problem.']],
 'slug-generator':[['text','Title','text','My New Project: A Better Workflow!']],
 'color-converter':[['text','Hex color','text','#2461d5']],
 'chmod-calculator':[['owner','Owner permissions','select','rwx|rw-|r-x|r--|---'],['group','Group permissions','select','r-x|rwx|rw-|r--|---'],['other','Other permissions','select','r-x|rwx|rw-|r--|---']],
 'random-number':[['min','Minimum','number','1'],['max','Maximum','number','100'],['count','Count (1–100)','number','10']],
 'regex-tester':[['pattern','Regular expression (without slashes)','text','\\b[a-z]+@[a-z]+\\.[a-z]+\\b'],['flags','Flags (g, i, m, s, u)','text','gi'],['text','Sample text','textarea','Contact test@example.com for more information.']],
 'url-parser':[['text','Complete URL','text','https://example.com:443/blog?id=123#details']],
 'ipv4-binary':[['text','IPv4 address','text','192.168.1.100']],
 'ip-range-checker':[['address','Subnet / CIDR','text','192.168.1.0/24'],['ip','IPv4 to check','text','192.168.1.250']],
 'port-reference':[['port','TCP / UDP port','number','443']],
 'mac-formatter':[['text','MAC address','text','AA-BB-CC-DD-EE-FF']],
 'dns-zone-generator':[['domain','DNS name','text','example.com'],['record','Record type','select','A|AAAA|CNAME|MX|TXT'],['value','Record destination / value','text','203.0.113.10'],['ttl','TTL (seconds)','number','3600']],
 'apache-vhost-generator':[['domain','Domain','text','example.com'],['port','Local backend port','number','3090']],
 'htaccess-generator':[['domain','Canonical hostname','text','example.com'],['www','Redirect www to apex','select','Yes|No']],
 'dockerfile-generator':[['image','Base Node image','select','node:22-alpine|node:22-bookworm-slim|node:24-alpine'],['port','App port','number','3000']],
 'docker-compose-generator':[['name','Service name','text','web-app'],['port','Published app port','number','3000']],
 'kubernetes-manifest':[['name','App name','text','web-app'],['image','Container image','text','nginx:stable'],['port','Container port','number','80'],['replicas','Replicas (1–20)','number','2']],
 'github-actions-workflow':[['node','Node.js major version','select','22|24|20'],['script','NPM test script','text','npm test']],
 'ansible-playbook-generator':[['hosts','Inventory group','text','webservers'],['packages','Packages (comma-separated)','text','nginx,git,ufw']],
 'security-headers-generator':[['strict','HTTPS only?','select','Yes|No'],['frame','Allow iframe embedding?','select','No|Same Origin']],
 'csp-generator':[['images','Allow data: images?','select','No|Yes'],['styles','Allow inline CSS?','select','No|Yes']],
 'password-strength':[['password','Password to evaluate (never transmitted)','password','']],
 'html-escape':[['text','HTML text','textarea','<h1>Hello & welcome!</h1>']]
};
Object.assign(fields,{
 'voltage-current':[['amps','Current (A)','number','4'],['ohms','Resistance (Ω)','number','12']],
 'ohms-law':[['volts','Voltage (V)','number','24'],['amps','Current (A)','number','2']],
 'ac-power':[['volts','Voltage RMS (V)','number','230'],['amps','Current RMS (A)','number','10'],['pf','Power factor (0–1)','number','0.85']],
 'three-phase-power':[['volts','Line-to-line voltage (V)','number','400'],['amps','Line current (A)','number','25'],['pf','Power factor (0–1)','number','0.85']],
 'motor-current':[['kw','Mechanical output power (kW)','number','7.5'],['volts','Rated voltage (V)','number','400'],['phase','Phase','select','Three-phase|Single-phase'],['pf','Power factor (0–1)','number','0.85'],['eff','Efficiency (0–1)','number','0.9']],
 'voltage-drop':[['amps','Current (A)','number','15'],['length','One-way cable length (m)','number','30'],['area','Cable cross section (mm²)','number','2.5'],['phase','Circuit','select','Single-phase DC/AC|Three-phase']],
 'energy-cost':[['watts','Load power (W)','number','1000'],['hours','Hours per day','number','8'],['days','Days','number','30'],['tariff','Tariff (IDR per kWh)','number','1444.7']]
});
const defs=fields[slug];if(!defs){inputs.innerHTML='<p>This utility is not available.</p>';return;}
const inputHtml=([name,label,type,example])=>{const id=`tool-${name}`,opts=String(example).split('|');return `<label><span class="tool-label">${esc(label)}</span>${type==='textarea'?`<textarea class="tool-textarea" id="${id}" spellcheck="false">${esc(example)}</textarea>`:type==='select'?`<select class="tool-select" id="${id}">${opts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>`:`<input class="tool-input" type="${type}" id="${id}" value="${esc(example)}" spellcheck="false">`}</label>`;};
inputs.innerHTML=`<div class="tool-form-row">${defs.map(inputHtml).join('')}</div><div class="tool-action-row"><button id="tool-run" type="button">${slug==='password-generator'||slug==='uuid-generator'||slug==='random-number'?'Generate':'Run tool'} →</button>${['url-encoder','base64','json-formatter','html-escape'].includes(slug)?'<button class="secondary-action" id="tool-alternate" type="button">'+({base64:'Decode', 'url-encoder':'Decode','json-formatter':'Minify','html-escape':'Unescape'})[slug]+'</button>':''}</div><p class="tool-hint">No data is transmitted to external services.</p>`;
const v=k=>$('#tool-'+k,workspace)?.value??'';
const must=(value,message)=>{if(!value)throw Error(message);return value;};
const validDomain=s=>{if(!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(s)||s.includes('..'))throw Error('Enter a valid domain or hostname.');return s;};
const validPort=p=>{const n=Number(p);if(!Number.isInteger(n)||n<1||n>65535)throw Error('Port must be between 1 and 65535.');return n;};
const fnName=s=>{if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(s))throw Error('Use only letters, numbers, dot, underscore or hyphen.');return s;};
const pathSafe=s=>{if(!/^\/[a-zA-Z0-9_./-]+$/.test(s)||s.includes('..'))throw Error('Enter an absolute Unix path without special shell characters.');return s;};
const decodeB64=s=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const encodeB64=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const randInt=max=>{if(!Number.isSafeInteger(max)||max<=0)throw Error('Invalid random range');const bytes=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;let n;do{crypto.getRandomValues(bytes);n=bytes[0];}while(n>=limit);return n%max;};
const getInteger=(s,min,max)=>{const n=Number(s);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`Enter an integer from ${min} to ${max}.`);return n;};
const positive=(name,nonzero=false)=>{const n=Number(v(name));if(!Number.isFinite(n)||n<0||(nonzero&&n===0)||!String(v(name)).trim())throw Error('Enter a valid '+name+' greater than '+(nonzero?'zero':'or equal to zero')+'.');return n;};
const fraction=name=>{const n=Number(v(name));if(!Number.isFinite(n)||n<=0||n>1)throw Error(name+' must be greater than 0 and not greater than 1.');return n;};
const powerFactor=()=>fraction('pf');
const runTool=async(alternate=false)=>{
 switch(slug){
 case 'ip-calculator':{const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(v('address').trim());if(!m||m.slice(1,5).some(x=>Number(x)>255))throw Error('Enter a valid IPv4 address such as 192.168.1.10/24');const prefix=m[5]===undefined?24:Number(m[5]);if(prefix>32)throw Error('CIDR prefix cannot exceed 32.');const ip=m.slice(1,5).reduce((acc,x)=>(((acc<<8)|Number(x))>>>0),0);const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;const network=(ip&mask)>>>0,broadcast=(network|(~mask))>>>0;const format=n=>[24,16,8,0].map(shift=>(n>>>shift)&255).join('.');const hosts=prefix===32?1:prefix===31?2:2**(32-prefix)-2;return `IP Address:     ${format(ip)}\nCIDR:           /${prefix}\nSubnet Mask:    ${format(mask)}\nNetwork:        ${format(network)}\nBroadcast:      ${format(broadcast)}\nFirst Host:     ${format(prefix>=31?network:network+1)}\nLast Host:      ${format(prefix>=31?broadcast:broadcast-1)}\nUsable Hosts:   ${hosts.toLocaleString()}`;}
 case 'dns-records':{const guide={A:'Maps a hostname to an IPv4 address.\nExample: example.com. IN A 203.0.113.10',AAAA:'Maps a hostname to an IPv6 address.\nExample: example.com. IN AAAA 2001:db8::10',CNAME:'Makes an alias for another hostname.\nExample: www.example.com. IN CNAME example.com.',MX:'Directs mail to receiving servers; a lower priority wins.\nExample: example.com. IN MX 10 mail.example.com.',TXT:'Holds verification, SPF, DKIM, DMARC and other textual values.\nExample: example.com. IN TXT "v=spf1 -all"',NS:'Identifies authoritative name servers.\nExample: example.com. IN NS ns1.example.net.',SOA:'Contains zone authority, serial and refresh/retry values.\nExample: example.com. IN SOA ns1.example.net. hostmaster.example.com. ...',CAA:'Restricts which certificate authorities may issue TLS certs.\nExample: example.com. IN CAA 0 issue "letsencrypt.org"',SRV:'Locates services by hostname and port.\nExample: _sip._tcp.example.com. IN SRV 0 5 5060 sip.example.com.',PTR:'Maps an IP address (via reversed zone) back to a hostname.\nExample: 10.113.0.203.in-addr.arpa. IN PTR host.example.com.'};return guide[v('record')];}
 case 'http-status':{const guide={100:'Continue',101:'Switching Protocols',200:'OK',201:'Created',202:'Accepted',204:'No Content',301:'Moved Permanently',302:'Found',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Request Timeout',409:'Conflict',410:'Gone',413:'Content Too Large',415:'Unsupported Media Type',418:"I'm a teapot",422:'Unprocessable Content',429:'Too Many Requests',500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'};const n=getInteger(v('code'),100,599);return `${n} ${guide[n]||'Uncommon / unassigned status'}\n\nClass: ${Math.floor(n/100)}xx — ${['','Informational','Successful','Redirection','Client error','Server error'][Math.floor(n/100)]||'Unknown'}`;}
 case 'url-encoder':return alternate?decodeURIComponent(v('text')):encodeURIComponent(v('text'));
 case 'base64':return alternate?decodeB64(v('text')):encodeB64(v('text'));
 case 'json-formatter':return JSON.stringify(JSON.parse(v('text')),null,alternate?0:2);
 case 'jwt-decoder':{const parts=v('text').trim().split('.');if(parts.length!==3)throw Error('JWT must contain three dot-separated segments.');const decode=s=>JSON.parse(decodeB64(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)));return 'HEADER\n'+JSON.stringify(decode(parts[0]),null,2)+'\n\nPAYLOAD\n'+JSON.stringify(decode(parts[1]),null,2)+'\n\n⚠ Signature is NOT verified. Never trust decoded claims without server-side verification.';}
 case 'sha256':{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v('text')));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
 case 'password-generator':{const len=getInteger(v('length'),8,128),chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'+(v('symbols')==='Yes'?'!@#$%^&*()-_=+[]{}':'');return Array.from({length:len},()=>chars[randInt(chars.length)]).join('');}
 case 'uuid-generator':return Array.from({length:getInteger(v('count'),1,30)},()=>crypto.randomUUID()).join('\n');
 case 'unix-timestamp':{const n=Number(v('text').trim());if(!Number.isFinite(n))throw Error('Invalid timestamp.');const ms=Math.abs(n)<1e11?n*1000:n;const d=new Date(ms);if(!Number.isFinite(d.getTime()))throw Error('Date out of range.');return `UTC:          ${d.toISOString()}\nLocal:        ${d.toLocaleString()}\nUnix seconds: ${Math.floor(d.getTime()/1000)}\nMilliseconds: ${d.getTime()}`;}
 case 'cron-helper':{const m={'Every minute':['* * * * *','At every minute'],'Every 5 minutes':['*/5 * * * *','Every 5 minutes'],'Every 15 minutes':['*/15 * * * *','Every 15 minutes'],Hourly:['0 * * * *','On the hour, every hour'],'Daily 09:00':['0 9 * * *','Every day at 09:00'],'Weekly Monday 09:00':['0 9 * * 1','Every Monday at 09:00'],'Monthly first day':['0 0 1 * *','First day of the month at 00:00']};const [exp,desc]=m[v('schedule')];return `${exp}\n\n${desc} (server-local timezone)\n\nFormat: minute hour day-of-month month day-of-week`;}
 case 'nginx-generator':{const domain=validDomain(v('domain').trim()),port=validPort(v('port'));return `# /etc/nginx/sites-available/${domain}\nserver {\n    listen 80;\n    server_name ${domain};\n\n    location / {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n}\n\n# Test: sudo nginx -t\n# Reload: sudo systemctl reload nginx\n# Enable HTTPS: sudo certbot --nginx -d ${domain}`;}
 case 'pm2-generator':{const name=fnName(v('name')),script=fnName(v('script')),port=validPort(v('port'));return `// ecosystem.config.cjs\nmodule.exports = {\n  apps: [{\n    name: '${name}',\n    script: './${script}',\n    cwd: __dirname,\n    instances: 1,\n    autorestart: true,\n    max_memory_restart: '300M',\n    env: { NODE_ENV: 'production', PORT: '${port}' }\n  }]\n};\n\n# pm2 start ecosystem.config.cjs\n# pm2 save`;}
 case 'systemd-generator':{const name=fnName(v('name')),cwd=pathSafe(v('cwd')),cmd=v('cmd').trim();if(!/^\/[a-zA-Z0-9_./-]+( [a-zA-Z0-9_./-]+)*$/.test(cmd)||cmd.includes('..'))throw Error('Use simple absolute command and arguments only.');return `# /etc/systemd/system/${name}.service\n[Unit]\nDescription=${name} service\nAfter=network.target\n\n[Service]\nType=simple\nUser=ubuntu\nWorkingDirectory=${cwd}\nExecStart=${cmd}\nRestart=on-failure\nRestartSec=5\nEnvironment=NODE_ENV=production\n\n[Install]\nWantedBy=multi-user.target\n\n# sudo systemctl daemon-reload\n# sudo systemctl enable --now ${name}`;}
 case 'ufw-generator':{const port=validPort(v('port')),proto=v('protocol'),source=v('source').trim();if(source&&!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(source))throw Error('Enter an IPv4 address or CIDR source.');const protocols=proto==='both'?['tcp','udp']:[proto];return protocols.map(p=>source?`sudo ufw allow from ${source} to any port ${port} proto ${p}`:`sudo ufw allow ${port}/${p}`).join('\n')+'\n\nsudo ufw status numbered\n# Review existing SSH rules before enabling a firewall.';}
 case 'ssh-command':{const user=fnName(v('user')),host=validDomain(v('host')),port=validPort(v('port')),key=v('key').trim();if(key&&!/^\/?[a-zA-Z0-9_./~\-]+$/.test(key))throw Error('Invalid key path.');return `ssh -p ${port}${key?' -i '+key:''} ${user}@${host}`;}
 case 'gitignore-generator':{const stack=v('stack'),common='# OS and IDE\n.DS_Store\nThumbs.db\n.idea/\n.vscode/\n\n# Credentials\n.env\n.env.*\n!.env.example\n*.pem\n';const presets={'Node.js':'node_modules/\nnpm-debug.log*\ndist/\ncoverage/\n*.sqlite\n*.sqlite-wal\n*.sqlite-shm\n','Python':'__pycache__/\n*.pyc\n.venv/\n.pytest_cache/\n','React':'node_modules/\ndist/\nbuild/\ncoverage/\n','PHP':'/vendor/\n/composer.lock\n','General':'*.tmp\n*.log\n'};return common+'\n# '+stack+'\n'+presets[stack];}
 case 'text-tools':{const text=v('text');return `Characters:             ${text.length}\nCharacters (no spaces): ${text.replace(/\s/g,'').length}\nWords:                  ${(text.match(/\b[\p{L}\p{N}'-]+\b/gu)||[]).length}\nLines:                  ${text?text.split(/\r?\n/).length:0}\nSentences:              ${(text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).filter(x=>x.trim()).length}`;}
 case 'slug-generator':return v('text').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 case 'color-converter':{const input=v('text').trim();const m=/^#?([a-f0-9]{3}|[a-f0-9]{6})$/i.exec(input);if(!m)throw Error('Enter a valid HEX color, e.g. #2461d5.');const hex=m[1].length===3?m[1].split('').map(x=>x+x).join(''):m[1];const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return `HEX:    #${hex.toLowerCase()}\nRGB:    rgb(${r}, ${g}, ${b})\nRGBA:   rgba(${r}, ${g}, ${b}, 1)\nHSL:    ${(()=>{const arr=[r,g,b].map(x=>x/255),hi=Math.max(...arr),lo=Math.min(...arr),d=hi-lo;let h=0,s=0,l=(hi+lo)/2;if(d){s=d/(1-Math.abs(2*l-1));h=hi===arr[0]?((arr[1]-arr[2])/d)%6:hi===arr[1]?(arr[2]-arr[0])/d+2:(arr[0]-arr[1])/d+4;h=(h*60+360)%360;}return `hsl(${Math.round(h)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`;})()}`;}
 case 'chmod-calculator':{const calc=x=>(x.includes('r')?4:0)+(x.includes('w')?2:0)+(x.includes('x')?1:0);const perms=[v('owner'),v('group'),v('other')];return `chmod ${perms.map(calc).join('')} filename\n\nSymbolic: ${perms.join('')}\nOwner: ${perms[0]}  Group: ${perms[1]}  Other: ${perms[2]}\n\nNote: Avoid globally writable permissions on sensitive files.`;}
 case 'random-number':{const min=getInteger(v('min'),-1000000000,1000000000),max=getInteger(v('max'),-1000000000,1000000000),count=getInteger(v('count'),1,100);if(max<min)throw Error('Maximum must be at least minimum.');return Array.from({length:count},()=>String(min+randInt(max-min+1))).join(', ');}
 case 'regex-tester':{const flags=v('flags').trim();if(!/^[gimsuy]*$/.test(flags)||new Set(flags).size!==flags.length)throw Error('Invalid or duplicate regex flags.');const regexp=new RegExp(v('pattern'),flags.includes('g')?flags:flags+'g'),text=v('text'),matches=Array.from(text.matchAll(regexp)).slice(0,100);return matches.length?matches.map((m,i)=>`Match ${i+1}: ${JSON.stringify(m[0])}  at index ${m.index}${m.length>1?'  groups: '+JSON.stringify(m.slice(1)):''}`).join('\n'):'No matches found.';}
 case 'url-parser':{const url=new URL(v('text').trim());return `Protocol:  ${url.protocol}\nHostname:  ${url.hostname}\nPort:      ${url.port||'(default)'}\nPath:      ${url.pathname}\nQuery:     ${url.search||'(none)'}\nFragment:  ${url.hash||'(none)'}\nOrigin:    ${url.origin}\n\nQuery parameters:\n${[...url.searchParams].map(([k,val])=>`  ${k}: ${val}`).join('\n')||'  (none)'}`;}
 case 'ipv4-binary':{const octets=v('text').trim().split('.').map(Number);if(octets.length!==4||octets.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Enter a valid IPv4 address.');return `Decimal: ${octets.join('.')}\nBinary:  ${octets.map(n=>n.toString(2).padStart(8,'0')).join('.')}\nHex:     ${octets.map(n=>n.toString(16).padStart(2,'0').toUpperCase()).join(':')}`;}
 case 'ip-range-checker':{const parsed=v('address').trim().match(/^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/);if(!parsed)throw Error('Enter a network in CIDR notation.');const ipNum=str=>{const xs=str.split('.').map(Number);if(xs.length!==4||xs.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid IPv4 address.');return xs.reduce((a,n)=>((a<<8)|n)>>>0,0);};const base=ipNum(parsed[1]),target=ipNum(v('ip').trim()),prefix=Number(parsed[2]);if(prefix>32)throw Error('Prefix must be between 0 and 32.');const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return `CIDR:        ${parsed[0]}\nTarget:      ${v('ip').trim()}\nNetwork:     ${parsed[1]}\nResult:      ${(base&mask)===(target&mask)?'INSIDE subnet ✓':'OUTSIDE subnet ✕'}`;}
 case 'port-reference':{const n=getInteger(v('port'),0,65535),ports={20:'FTP Data',21:'FTP Control',22:'SSH',23:'Telnet (insecure)',25:'SMTP',53:'DNS (TCP/UDP)',67:'DHCP Server',68:'DHCP Client',80:'HTTP',110:'POP3',123:'NTP',143:'IMAP',161:'SNMP',389:'LDAP',443:'HTTPS',445:'SMB',465:'SMTPS',587:'SMTP Submission',636:'LDAPS',993:'IMAPS',995:'POP3S',1433:'Microsoft SQL Server',1521:'Oracle DB',2049:'NFS',2375:'Docker API (unencrypted)',3000:'Common Node.js development port',3306:'MySQL / MariaDB',3389:'RDP',5432:'PostgreSQL',5672:'AMQP',6379:'Redis',8080:'Alternative HTTP / application',8443:'Alternative HTTPS',9200:'Elasticsearch',27017:'MongoDB'};return `Port:       ${n}\nDescription: ${ports[n]||'No built-in service label for this port'}\nRange:       ${n<=1023?'Well-known (0–1023)':n<=49151?'Registered (1024–49151)':'Dynamic/private (49152–65535)'}\n\nNote: Port usage is configurable; the actual running service may differ.`;}
 case 'mac-formatter':{const hex=v('text').trim().replace(/[-:.\s]/g,'').toLowerCase();if(!/^[a-f0-9]{12}$/.test(hex))throw Error('Enter exactly 12 hexadecimal digits.');const octets=hex.match(/.{2}/g);return `Colon:         ${octets.join(':')}\nHyphen:        ${octets.join('-').toUpperCase()}\nCisco:         ${hex.match(/.{4}/g).join('.')}\nUnicast:       ${(parseInt(hex.slice(0,2),16)&1)===0?'Yes':'No (multicast)'}\nLocally owned: ${(parseInt(hex.slice(0,2),16)&2)!==0?'Locally administered':'Universally administered'}`;}
 case 'dns-zone-generator':{const domain=validDomain(v('domain').trim()),type=v('record'),ttl=getInteger(v('ttl'),60,2147483647),value=v('value').trim();if(!value||/[\r\n]/.test(value))throw Error('Enter a single-line record value.');if(type==='A'&&!/^(\d{1,3}\.){3}\d{1,3}$/.test(value))throw Error('A records require IPv4 address.');if(type==='CNAME'||type==='MX')validDomain(value);if(type==='TXT'&&value.length>255)throw Error('TXT value must be under 256 characters for this generator.');return `${domain}. ${ttl} IN ${type} ${type==='MX'?'10 ':''}${type==='TXT'?JSON.stringify(value):value}${['CNAME','MX'].includes(type)?'.':''}\n\n# Generated as a zone file record; adapt to your DNS provider's form.`;}
 case 'apache-vhost-generator':{const domain=validDomain(v('domain')),port=validPort(v('port'));return `# Enable mod_proxy and mod_proxy_http before use\n<VirtualHost *:80>\n    ServerName ${domain}\n    ProxyPreserveHost On\n    ProxyPass / http://127.0.0.1:${port}/\n    ProxyPassReverse / http://127.0.0.1:${port}/\n    ErrorLog \${APACHE_LOG_DIR}/${domain}-error.log\n    CustomLog \${APACHE_LOG_DIR}/${domain}-access.log combined\n</VirtualHost>\n\n# sudo apache2ctl configtest\n# sudo systemctl reload apache2`;}
 case 'htaccess-generator':{const domain=validDomain(v('domain')),www=v('www');return `# Place in document root with Apache mod_rewrite enabled\nOptions -Indexes\nRewriteEngine On\n\n# Force HTTPS and canonical hostname\nRewriteCond %{HTTPS} !=on [OR]\n${www==='Yes'?`RewriteCond %{HTTP_HOST} !^${domain.replace(/\./g,'\\.')}$ [NC]`:'RewriteCond %{HTTP_HOST} !^'+domain.replace(/\./g,'\\.')+'$ [NC]'}\nRewriteRule ^ https://${domain}%{REQUEST_URI} [R=301,L]\n\n# Deny dot-files (except .well-known)\n<FilesMatch "^\\.(?!well-known)">\n    Require all denied\n</FilesMatch>`;}
 case 'dockerfile-generator':{const img=v('image');if(!['node:22-alpine','node:22-bookworm-slim','node:24-alpine'].includes(img))throw Error('Invalid base image.');const port=validPort(v('port'));return `# Dockerfile — generated reference, not required to host this website\nFROM ${img}\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nENV NODE_ENV=production\nEXPOSE ${port}\nUSER node\nCMD ["node", "server.js"]\n\n# Build: docker build -t my-app .`;}
 case 'docker-compose-generator':{const name=fnName(v('name')),port=validPort(v('port'));return `# compose.yaml\nservices:\n  ${name}:\n    build: .\n    restart: unless-stopped\n    environment:\n      NODE_ENV: production\n      PORT: "${port}"\n    ports:\n      - "127.0.0.1:${port}:${port}"\n    # Add named volumes if your app writes persistent data`;}
 case 'kubernetes-manifest':{const name=fnName(v('name')),img=v('image').trim(),port=validPort(v('port')),replicas=getInteger(v('replicas'),1,20);if(!/^[a-zA-Z0-9._\/@:-]{1,200}$/.test(img))throw Error('Invalid image name.');return `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app: ${name}\n  template:\n    metadata:\n      labels:\n        app: ${name}\n    spec:\n      containers:\n        - name: ${name}\n          image: ${img}\n          ports:\n            - containerPort: ${port}\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  selector:\n    app: ${name}\n  ports:\n    - port: ${port}\n      targetPort: ${port}`;}
 case 'github-actions-workflow':{const node=v('node'),cmd=v('script').trim();if(!['20','22','24'].includes(node)||!/^npm (test|run [a-zA-Z0-9:_-]+)$/.test(cmd))throw Error('Use npm test or npm run <safe-name>.');return `# .github/workflows/ci.yml\nname: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '${node}'\n          cache: npm\n      - run: npm ci\n      - run: ${cmd}`;}
 case 'ansible-playbook-generator':{const hosts=fnName(v('hosts')),packages=v('packages').split(',').map(x=>x.trim()).filter(Boolean);if(!packages.length||packages.length>30||packages.some(x=>!/^[a-zA-Z0-9.+_-]+$/.test(x)))throw Error('Provide 1–30 valid package names, comma separated.');return `---\n- name: Install server packages\n  hosts: ${hosts}\n  become: true\n  tasks:\n    - name: Ensure required packages are installed\n      ansible.builtin.apt:\n        name:\n${packages.map(x=>'          - '+x).join('\n')}\n        state: present\n        update_cache: true`;}
 case 'security-headers-generator':{const strict=v('strict')==='Yes',frame=v('frame');return `# HTTP response headers\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nX-Frame-Options: ${frame==='No'?'DENY':'SAMEORIGIN'}\nPermissions-Policy: camera=(), microphone=(), geolocation=()\nCross-Origin-Opener-Policy: same-origin\n${strict?'Strict-Transport-Security: max-age=31536000; includeSubDomains\n':''}Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'\n\n# HSTS requires working HTTPS on all included subdomains.`;}
 case 'csp-generator':{const imgs=v('images')==='Yes',styles=v('styles')==='Yes';return `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'${styles?" 'unsafe-inline'":''}; img-src 'self'${imgs?' data:':''}; font-src 'self'; connect-src 'self'; form-action 'self'\n\n# Start in Content-Security-Policy-Report-Only mode if you have an existing site.`;}
 case 'password-strength':{const pwd=v('password');if(!pwd)throw Error('Enter a password to evaluate locally.');const tests=[/[a-z]/.test(pwd),/[A-Z]/.test(pwd),/\d/.test(pwd),/[^a-zA-Z0-9]/.test(pwd)],set=[26,26,10,32].reduce((a,b,i)=>a+(tests[i]?b:0),0),entropy=Math.round(pwd.length*Math.log2(Math.max(set,1)));const obvious=/password|admin|12345|qwerty|letmein|iloveyou|abcdef/i.test(pwd),score=Math.max(0,Math.min(4,Math.floor(entropy/27)-(obvious?2:0)));const labels=['Very weak','Weak','Fair','Good','Strong'];return `Length:                 ${pwd.length} characters\nCharacter groups:       ${tests.filter(Boolean).length}/4\nEstimated entropy:      ${entropy} bits (oversimplified)\nObvious pattern:        ${obvious?'Yes':'Not detected'}\nHeuristic result:       ${labels[score]}\n\nThis is not a breach check or a formal security assessment. Prefer a unique 16+ character passphrase and a password manager.`;}
 case 'voltage-current':{const I=positive('amps'),R=positive('ohms');return `Voltage: ${(I*R).toFixed(3)} V\nCurrent: ${I} A\nResistance: ${R} Ω\nPower: ${(I*I*R).toFixed(3)} W`;}
 case 'ohms-law':{const V=positive('volts'),I=positive('amps',true);return `Resistance: ${(V/I).toFixed(4)} Ω\nPower: ${(V*I).toFixed(3)} W\nFormula: R = V / I`;}
 case 'ac-power':{const V=positive('volts'),I=positive('amps'),pf=powerFactor();const VA=V*I;return `Apparent: ${(VA/1000).toFixed(3)} kVA\nActive: ${(VA*pf/1000).toFixed(3)} kW\nReactive: ${(VA*Math.sqrt(1-pf*pf)/1000).toFixed(3)} kVAR\nSingle-phase RMS estimate`;}
 case 'three-phase-power':{const V=positive('volts'),I=positive('amps'),pf=powerFactor(),VA=Math.sqrt(3)*V*I;return `Apparent: ${(VA/1000).toFixed(3)} kVA\nActive: ${(VA*pf/1000).toFixed(3)} kW\nReactive: ${(VA*Math.sqrt(1-pf*pf)/1000).toFixed(3)} kVAR\nAssumes balanced sinusoidal loads`;}
 case 'motor-current':{const kw=positive('kw'),V=positive('volts'),pf=powerFactor(),eff=fraction('eff'),mult=v('phase')==='Three-phase'?Math.sqrt(3):1;return `Estimated FLC: ${(kw*1000/(mult*V*pf*eff)).toFixed(2)} A\nInput power: ${(kw/eff).toFixed(3)} kW\nThis is an estimate, not the nameplate current. Size protection using applicable codes.`;}
 case 'voltage-drop':{const I=positive('amps'),L=positive('length'),area=positive('area'),rho=0.0175,three=v('phase')==='Three-phase',mult=three?Math.sqrt(3):2,drop=mult*I*L*rho/area;return `Estimated voltage drop: ${drop.toFixed(3)} V\nConductor: copper (20°C approximate resistivity)\n${three?'Balanced 3-phase':'Single-phase/DC'} circuit\nDoes not include reactance or operating-temperature rise.`;}
 case 'energy-cost':{const watts=positive('watts'),h=positive('hours'),days=positive('days'),tariff=positive('tariff'),kwh=watts/1000*h*days;return `Energy: ${kwh.toFixed(2)} kWh\nEstimated cost: Rp ${(kwh*tariff).toLocaleString('id-ID',{maximumFractionDigits:2})}\nExcludes taxes, adjustments and other charges.`;}
 case 'html-escape':{const s=v('text');if(!alternate)return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi,(all,c)=>{const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"};if(c[0]==='#'){const n=c[1].toLowerCase()==='x'?parseInt(c.slice(2),16):Number(c.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}return named[c.toLowerCase()]||all;});}
 default:throw Error('Unknown tool');
 }
};
async function exec(alternate=false){try{output.textContent=String(await runTool(alternate));}catch(e){output.textContent='Error: '+e.message;}}
$('#tool-run',workspace)?.addEventListener('click',()=>exec(false));$('#tool-alternate',workspace)?.addEventListener('click',()=>exec(true));$('.copy-tool',workspace)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(output.textContent);$('.copy-tool',workspace).textContent='✓ Copied';setTimeout(()=>$('.copy-tool',workspace).textContent='Copy',1400);}catch{const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(output);selection.removeAllRanges();selection.addRange(range);}});
$$('.tool-input,.tool-select',workspace).forEach(x=>x.addEventListener('keydown',e=>{if(e.key==='Enter')exec(false);}));
}
return ()=>{pageEvents.abort();stopParticles();toolModal?.remove();cvModal?.remove();document.body.classList.remove('has-modal');};
}
// Lightweight canvas constellation, scoped to the home page.
function initParticles(){
 const canvas=$('#particle-canvas');
 if(!canvas)return ()=>{};
 const ctx=canvas.getContext('2d');
 if(!ctx)return ()=>{};
 const events=new AbortController(),signal=events.signal;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const pointer={x:0,y:0,active:false};
 let dots=[],w=0,h=0,raf=0,last=0,visible=true;
 function resize(){
  const rect=canvas.getBoundingClientRect();w=rect.width;h=rect.height;
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const count=Math.min(64,Math.max(24,Math.floor(w*h/18000)));
  dots=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.32,vy:(Math.random()-.5)*.32,dx:0,dy:0,r:.8+Math.random()*.6}));
 }
 function paint(time=0){
  raf=0;
  if(document.hidden||!visible)return;
  // Cap rendering at 30fps, independent of monitor refresh rate.
  if(!reduced.matches&&time-last<32){raf=requestAnimationFrame(paint);return;}
  const step=Math.min((time-last)/16.67||1,3);last=time;
  ctx.clearRect(0,0,w,h);
  const dark=document.documentElement.dataset.theme==='dark';
  ctx.fillStyle=ctx.strokeStyle=dark?'#79b6ff':'#497ed1';
  for(const dot of dots){
   if(!reduced.matches){
    const x=dot.x-pointer.x,y=dot.y-pointer.y,distance=Math.hypot(x,y);
    if(pointer.active&&distance<125){
     const force=(1-distance/125)*.2;
     dot.dx+=(distance?x/distance:1)*force*step;
     dot.dy+=(distance?y/distance:0)*force*step;
    }
    dot.dx*=Math.pow(.94,step);dot.dy*=Math.pow(.94,step);
    dot.x+=(dot.vx+dot.dx)*step;dot.y+=(dot.vy+dot.dy)*step;
    if(dot.x<2||dot.x>w-2){dot.x=Math.max(2,Math.min(w-2,dot.x));dot.vx*=-1;dot.dx*=-.4;}
    if(dot.y<2||dot.y>h-2){dot.y=Math.max(2,Math.min(h-2,dot.y));dot.vy*=-1;dot.dy*=-.4;}
   }
  }
  const reach=w<600?105:140;
  ctx.lineWidth=.6;
  for(let i=0;i<dots.length;i++){
   const a=dots[i];
   for(let j=i+1;j<dots.length;j++){
    const b=dots[j],square=(a.x-b.x)**2+(a.y-b.y)**2;
    if(square>reach*reach)continue;
    ctx.globalAlpha=(1-Math.sqrt(square)/reach)*(dark?.3:.24);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
   }
   ctx.globalAlpha=dark?.7:.58;ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  if(!reduced.matches)raf=requestAnimationFrame(paint);
 }
 function restart(){cancelAnimationFrame(raf);last=0;paint();}
 window.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'||reduced.matches)return;
  const rect=canvas.getBoundingClientRect();
  pointer.x=e.clientX-rect.left;pointer.y=e.clientY-rect.top;
  pointer.active=pointer.x>=0&&pointer.x<=w&&pointer.y>=0&&pointer.y<=h;
 },{passive:true,signal});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)pointer.active=false;},{signal});
 window.addEventListener('blur',()=>{pointer.active=false;},{signal});
 window.addEventListener('resize',()=>{pointer.active=false;resize();restart();},{passive:true,signal});
 window.addEventListener('scroll',()=>{pointer.active=false;},{passive:true,signal});
 document.addEventListener('visibilitychange',restart,{signal});
 reduced.addEventListener('change',restart,{signal});
 const theme=new MutationObserver(()=>{if(reduced.matches)restart();});
 theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;restart();}):null;
 observer?.observe(canvas);
 resize();restart();
 return ()=>{events.abort();cancelAnimationFrame(raf);observer?.disconnect();theme.disconnect();};
}

// Enhance public links only; the server still renders every directly opened URL.
function initNavigation(){
 if(!$('.site-wrapper')||!window.fetch||!window.DOMParser)return;
 const menuPaths=new Set(staticLinks.map(item=>item.href));
 const cache=new Map(),pending=new Map(),ttl=60000;
 let sequence=0,scrollTimer=0;
 const key=url=>url.pathname+url.search;
 const current=()=>location.pathname+location.search;
 const allowed=url=>url.origin===location.origin&&(!url.search)&&
  (menuPaths.has(url.pathname)||/^\/(posts|portfolio)\/[a-z0-9-]+$/.test(url.pathname));
 function rememberScroll(){
  history.replaceState({...history.state,fhScroll:[scrollX,scrollY]},'',location.href);
 }
 history.scrollRestoration='manual';rememberScroll();
 window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(rememberScroll,100);},{passive:true});
 async function load(url){
  const name=key(url),stored=cache.get(name);
  if(stored&&Date.now()-stored.time<ttl)return stored.html;
  if(pending.has(name))return pending.get(name);
  const request=(async()=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await fetch(name,{headers:{Accept:'text/html'},credentials:'same-origin',signal:controller.signal});
    if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('text/html'))throw Error('Navigation response unavailable');
    const html=await response.text();
    if(menuPaths.has(url.pathname)){
     cache.delete(name);cache.set(name,{html,time:Date.now()});
     if(cache.size>7)cache.delete(cache.keys().next().value);
    }
    return html;
   }finally{clearTimeout(timeout);}
  })();
  pending.set(name,request);
  try{return await request;}finally{pending.delete(name);}
 }
 function updateHead(next){
  document.title=next.title;
  for(const selector of ['meta[name="description"]','link[rel="canonical"]','meta[property="og:title"]','meta[property="og:description"]','meta[property="og:type"]','meta[property="og:url"]','meta[name="robots"]','script[type="application/ld+json"]']){
   const old=$(selector,document.head),incoming=$(selector,next.head);
   if(incoming){const copy=document.importNode(incoming,true);if(old)old.replaceWith(copy);else document.head.appendChild(copy);}else old?.remove();
  }
 }
 function scrollToPage(url,position){
  if(position){window.scrollTo({left:position[0],top:position[1],behavior:'instant'});return;}
  let target=null;
  try{if(url.hash)target=document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{}
  if(target)target.scrollIntoView({behavior:'instant'});else window.scrollTo({top:0,left:0,behavior:'instant'});
 }
 async function navigate(url,{pop=false,position=null}={}){
  const token=++sequence;
  clearTimeout(scrollTimer);
  if(!pop)rememberScroll();
  try{
   const html=await load(url);
   if(token!==sequence)return;
   const next=new DOMParser().parseFromString(html,'text/html'),incoming=$('.site-wrapper',next);
   if(!incoming?.querySelector('main')||!$('.site-header',next))throw Error('Missing page content');
   closeSearch();cleanupPage();
   $('#particle-canvas')?.remove();
   $('.site-wrapper').replaceWith(document.importNode(incoming,true));
   const canvas=$('#particle-canvas',next);
   if(canvas)$('.site-header').after(document.importNode(canvas,true));
   updateHead(next);
   if(!pop)history.pushState({fhScroll:[0,0]},'',url.pathname+url.search+url.hash);
   $$('#main-nav a').forEach(link=>{
    const active=new URL(link.href).pathname===url.pathname||(link.pathname!=='/'&&url.pathname.startsWith(link.pathname+'/'));
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
   });
   $('#main-nav')?.classList.remove('is-open');$('.menu-toggle')?.setAttribute('aria-expanded','false');
   cleanupPage=initPage();
   const heading=$('.site-wrapper h1')||$('.site-wrapper main');
   if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
   scrollToPage(url,position);
   document.dispatchEvent(new CustomEvent('febro:navigated',{detail:{path:url.pathname}}));
  }catch{
   // Keep ordinary navigation available if the connection or enhancement fails.
   if(token===sequence)location.assign(url.href);
  }
 }
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a[href]');
  if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self')||link.relList.contains('external'))return;
  const url=new URL(link.href,location.href);
  if(!allowed(url))return;
  if(key(url)===current()){
   // Let hash anchors use native browser history and scrolling.
   if(url.hash)return;
   event.preventDefault();++sequence;closeSearch();window.scrollTo({top:0,behavior:'instant'});return;
  }
  event.preventDefault();void navigate(url);
 });
 window.addEventListener('popstate',event=>{
  ++sequence;
  const url=new URL(location.href);
  if(allowed(url))void navigate(url,{pop:true,position:event.state?.fhScroll||[0,0]});else location.reload();
 });
 function prefetch(event){
  const link=event.target.closest('a[href]');if(!link)return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin&&menuPaths.has(url.pathname)&&!url.search&&!url.hash&&key(url)!==current())void load(url).catch(()=>{});
 }
 const connection=navigator.connection;
 if(!connection?.saveData&&!/2g/.test(connection?.effectiveType||'')){
  document.addEventListener('pointerover',prefetch,{passive:true});document.addEventListener('focusin',prefetch);
  // Warm the seven small menu documents sequentially, after initial rendering.
  const warm=async()=>{for(const path of menuPaths){if(document.hidden)break;if(path!==location.pathname)try{await load(new URL(path,location.href));}catch{}}};
  if('requestIdleCallback' in window)requestIdleCallback(warm,{timeout:2000});else setTimeout(warm,1500);
 }
}

let cleanupPage=initPage();
initNavigation();
})();

// Visual editor retains the existing object-of-arrays storage format.
(()=>{
 const root=document.querySelector('#skill-editor');if(!root)return;
 const field=document.querySelector('input[name="skills_json"]'),form=field.form;
 let groups;try{const value=JSON.parse(field.value);if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(v=>!Array.isArray(v)||v.some(s=>typeof s!=='string')))throw Error();groups=Object.entries(value).map(([name,skills])=>({name,skills:[...skills]}));}catch{root.textContent='Data skill lama tidak dapat dibaca. Nilai asli tetap disimpan. Hubungi administrator untuk pemulihan dari backup.';return;}
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.className='button secondary';b.onclick=fn;return b;};
 function sync(){const names=groups.map(g=>g.name.trim());const error=names.some(n=>!n)?'Nama grup wajib diisi.':new Set(names).size!==names.length?'Nama grup harus unik.':groups.some(g=>g.skills.some(s=>!s.trim()))?'Nama skill wajib diisi.':'';status.textContent=error;field.value=JSON.stringify(Object.fromEntries(groups.map(g=>[g.name,[...g.skills]])));return !error;}
 function move(list,index,delta){const target=index+delta;if(target<0||target>=list.length)return;[list[index],list[target]]=[list[target],list[index]];render();}
 function render(){root.replaceChildren();root.append(node('h2','Skill Groups'),status);
 groups.forEach((g,i)=>{const card=node('article');card.className='skill-group';const label=node('label','Nama grup');const name=node('input');name.value=g.name;name.maxLength=120;name.setAttribute('aria-label','Nama grup');name.oninput=()=>{g.name=name.value;sync();};label.append(name);card.append(label);
 const actions=node('div');actions.className='row-actions';const up=button('↑ Grup',()=>move(groups,i,-1)),down=button('↓ Grup',()=>move(groups,i,1));up.disabled=i===0;down.disabled=i===groups.length-1;
 actions.append(up,down,button('Hapus grup',()=>{const confirm=node('div','Hapus grup beserta skill? ');confirm.className='skill-confirm';confirm.append(button('Ya, hapus',()=>{groups.splice(i,1);render();}),button('Batal',()=>confirm.remove()));actions.replaceChildren(confirm);}));card.append(actions);
 const chips=node('div');chips.className='skill-chips';g.skills.forEach((skill,j)=>{const chip=node('div');chip.className='skill-chip';const input=node('input');input.value=skill;input.maxLength=200;input.setAttribute('aria-label','Edit skill');input.oninput=()=>{g.skills[j]=input.value;sync();};const left=button('←',()=>move(g.skills,j,-1)),right=button('→',()=>move(g.skills,j,1));left.disabled=j===0;right.disabled=j===g.skills.length-1;left.setAttribute('aria-label','Pindahkan skill ke kiri');right.setAttribute('aria-label','Pindahkan skill ke kanan');const remove=button('×',()=>{g.skills.splice(j,1);render();});remove.setAttribute('aria-label','Hapus skill '+skill);chip.append(input,left,right,remove);chips.append(chip);});
 card.append(chips,button('+ Skill',()=>{g.skills.push('');render();cardFocus(i);}));root.append(card);});
 root.append(button('+ Grup',()=>{groups.push({name:'',skills:[]});render();cardFocus(groups.length-1);}));sync();}
 function cardFocus(i){root.querySelectorAll('.skill-group')[i]?.querySelector('input')?.focus();}
 form.addEventListener('submit',event=>{if(!sync()){event.preventDefault();status.scrollIntoView({block:'center'});} });render();
})();
