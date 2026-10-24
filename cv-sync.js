'use strict';
// Optional read-only sync from the existing PocketBase service.
// No backend credentials are stored or exposed in HTML; uses only public collections.
const API='http://127.0.0.1:8095';
const mappings={experience:process.env.CV_SYNC_EXPERIENCE,education:process.env.CV_SYNC_EDUCATION,certification:process.env.CV_SYNC_CERTIFICATIONS};
let cache={status:'not-configured',lastSync:null,error:'Set collection names in PM2 environment to enable synchronization.',records:{}};
const clean=(v,max=3000)=>String(v??'').slice(0,max);
const str=(r,names)=>{for(const k of names)if(r[k]!==undefined && r[k]!==null && String(r[k]).trim())return clean(r[k]);return '';};
const normalize=(r,kind)=>({
 id:clean(r.id,64),kind,
 title:str(r,['title','position','job_title','name','degree','certificate_name']),
 company:str(r,['company','company_name','institution','organization','issuer','school']),
 period:str(r,['period','date_range','dates','duration']),
 year:str(r,['year','start_year']),
 description:str(r,['description','summary','details','content']),
 body:str(r,['body','responsibilities','bullets'])
});
async function refresh(){
 if(!Object.values(mappings).some(Boolean))return cache;
 const records={};try{
  for(const [kind,col] of Object.entries(mappings)){
   if(!col)continue;
   if(!/^[A-Za-z0-9_-]{1,75}$/.test(col))throw Error('Invalid collection name for '+kind);
   const response=await fetch(`${API}/api/collections/${encodeURIComponent(col)}/records?perPage=100`,{signal:AbortSignal.timeout(2800),headers:{accept:'application/json'}});
   if(!response.ok)throw Error(`Collection ${col}: HTTP ${response.status} (confirm public list permission)`);
   const data=await response.json();if(!Array.isArray(data.items))throw Error('Invalid PocketBase list response');
   records[kind]=data.items.map(r=>normalize(r,kind)).filter(x=>x.title).slice(0,100);
  }
  cache={status:'synced',lastSync:new Date().toISOString(),error:'',records};
 }catch(err){cache={...cache,status:cache.lastSync?'stale':'unavailable',error:clean(err.message,200)};}
 return cache;
}
function get(){return cache;}
// Small background task, never blocks a public request or the initial render.
if(Object.values(mappings).some(Boolean)){
 setImmediate(()=>refresh().catch(()=>{}));
 const timer=setInterval(()=>refresh().catch(()=>{}),15*60*1000);timer.unref();
}
module.exports={get,refresh};
