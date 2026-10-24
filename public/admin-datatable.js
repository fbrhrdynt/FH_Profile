(()=>{'use strict';
function init(){
for(const wrap of document.querySelectorAll('.admin-table-scroll')){
 const table=wrap.querySelector('table.admin-table');if(!table||wrap.dataset.fhTableInit)return;
 const body=table.tBodies[0];if(!body)return;
 const rows=Array.from(body.rows);if(!rows.length)return;
 wrap.dataset.fhTableInit='1';
 const heads=Array.from(table.tHead?.rows[0]?.cells||[]);
 const bar=document.createElement('div');bar.className='fh-table-toolbar';
 const search=document.createElement('input');search.type='search';search.placeholder='Search records…';search.setAttribute('aria-label','Search records');
 const sort=document.createElement('select');sort.setAttribute('aria-label','Sort records');sort.add(new Option('Original order',''));
 heads.forEach((h,i)=>{if(/actions|order/i.test(h.textContent))return;sort.add(new Option(h.textContent.trim()+' · A–Z',i+':asc'));sort.add(new Option(h.textContent.trim()+' · Z–A',i+':desc'));});
 const count=document.createElement('span');count.className='fh-table-count';count.setAttribute('aria-live','polite');
 bar.append(search,sort,count);wrap.before(bar);
 const style=document.createElement('style');style.textContent=`
 .fh-table-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 12px;padding:12px;background:#fff;border:1px solid #e0e8f2;border-radius:10px}
 .fh-table-toolbar input,.fh-table-toolbar select{font:inherit;font-size:13px;padding:9px 11px;background:#fff;color:#142541;border:1px solid #dce5f0;border-radius:8px;min-height:40px}
 .fh-table-toolbar input{min-width:160px;flex:1 1 190px}.fh-table-toolbar select{flex:0 1 210px;max-width:100%}
 .fh-table-count{font-size:12px;color:#617693}
 .admin-page .admin-table-scroll{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}
 .admin-page .admin-table-scroll .admin-table{display:table!important;width:max-content!important;min-width:850px!important}
 .admin-page .admin-table-scroll .admin-table thead{display:table-header-group!important}
 .admin-page .admin-table-scroll .admin-table tbody{display:table-row-group!important}
 .admin-page .admin-table-scroll .admin-table tr{display:table-row!important}
 .admin-page .admin-table-scroll .admin-table th,.admin-page .admin-table-scroll .admin-table td{display:table-cell!important;vertical-align:middle!important;position:static!important;float:none!important;padding:12px 14px!important;white-space:nowrap!important}
 .admin-page .admin-table-scroll .admin-table td::before,.admin-page .admin-table-scroll .admin-table td::after{content:none!important;display:none!important}
 .admin-page .admin-table-scroll .admin-table .row-actions{display:flex!important;align-items:center!important;flex-wrap:nowrap!important;flex-direction:row!important}
 .admin-page .admin-table-scroll .admin-table tr[hidden]{display:none!important}
 `;document.head.append(style);
 const refresh=()=>{const q=search.value.trim().toLocaleLowerCase();let visible=rows.filter(row=>!q||row.textContent.toLocaleLowerCase().includes(q));const choice=sort.value;if(choice){const [ix,dir]=choice.split(':');visible.sort((a,b)=>(dir==='desc'?-1:1)*(a.cells[+ix]?.textContent.trim()||'').localeCompare(b.cells[+ix]?.textContent.trim()||'',undefined,{numeric:true,sensitivity:'base'}));}
 const hidden=rows.filter(x=>!visible.includes(x));for(const row of [...visible,...hidden]){row.hidden=hidden.includes(row);body.appendChild(row);}
 count.textContent=visible.length+' / '+rows.length+' records';};
 search.addEventListener('input',refresh);sort.addEventListener('change',refresh);refresh();
}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();