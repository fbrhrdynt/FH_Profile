(()=>{'use strict';
const table=document.querySelector('.admin-table-scroll .admin-table');if(!table)return;
const wrap=table.closest('.admin-table-scroll'),rows=[...table.tBodies[0]?.rows||[]];if(!rows.length)return;
const toolbar=document.createElement('div');toolbar.className='fh-datatable-tools';
toolbar.innerHTML='<label class="fh-datatable-search">Search records <input type="search" placeholder="Search title, category, status…" autocomplete="off"></label><label class="fh-datatable-sort">Sort by <select><option value="default">Original order</option><option value="title-asc">Title A–Z</option><option value="title-desc">Title Z–A</option><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option></select></label><span class="fh-datatable-count" aria-live="polite"></span>';
wrap.parentNode.insertBefore(toolbar,wrap);
const style=document.createElement('style');style.textContent=`
.admin-page .fh-datatable-tools{display:flex;align-items:end;flex-wrap:wrap;gap:12px;padding:15px 18px;background:#fff;border:1px solid #e0e8f2;border-radius:11px 11px 0 0}
.admin-page .fh-datatable-tools label{display:grid;gap:5px;font-size:12px;font-weight:600;color:#526783}
.admin-page .fh-datatable-tools input,.admin-page .fh-datatable-tools select{border:1px solid #dce5f0;border-radius:7px;background:#fff;color:#172943;padding:9px 11px;font:inherit;min-height:38px}
.admin-page .fh-datatable-search{flex:1;min-width:160px}.admin-page .fh-datatable-search input{width:100%}
.admin-page .fh-datatable-count{margin-left:auto;font-size:12px;color:#647996;white-space:nowrap}
.admin-page .admin-panel.admin-table-scroll{display:block!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch!important;max-width:100%;padding:0!important;border-radius:0 0 11px 11px}
.admin-page .admin-table-scroll .admin-table{display:table!important;table-layout:auto!important;border-collapse:collapse!important;width:100%!important;min-width:850px!important}
.admin-page .admin-table-scroll .admin-table thead{display:table-header-group!important}
.admin-page .admin-table-scroll .admin-table tbody{display:table-row-group!important}
.admin-page .admin-table-scroll .admin-table tr{display:table-row!important;height:auto!important;min-height:0!important}
.admin-page .admin-table-scroll .admin-table th,.admin-page .admin-table-scroll .admin-table td{display:table-cell!important;float:none!important;position:static!important;vertical-align:middle!important;width:auto!important;min-width:0!important;max-width:none!important;padding:13px 16px!important;height:64px!important;white-space:nowrap!important;text-align:left!important;box-shadow:none!important}
.admin-page .admin-table-scroll .admin-table td::before,.admin-page .admin-table-scroll .admin-table td:before{content:none!important;display:none!important}
.admin-page .admin-table-scroll .admin-table td:first-child{min-width:260px!important;max-width:340px!important}
.admin-page .admin-table-scroll .admin-table td:first-child strong{max-width:320px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.admin-page .admin-table-scroll .admin-table td:last-child{min-width:130px!important}
.admin-page .admin-table-scroll .admin-table .row-actions{display:flex!important;flex-direction:row!important;align-items:center!important;flex-wrap:nowrap!important;gap:16px!important}
.admin-page .admin-table-scroll .admin-table .row-actions form{margin:0!important}
@media(max-width:760px){.admin-page .fh-datatable-tools{padding:12px;gap:8px}.admin-page .fh-datatable-count{width:100%}.admin-page .admin-table-scroll .admin-table{min-width:850px!important}}
`;document.head.appendChild(style);
const search=toolbar.querySelector('input'),sort=toolbar.querySelector('select'),count=toolbar.querySelector('.fh-datatable-count');
const normalize=s=>String(s||'').toLocaleLowerCase();
function render(){const q=normalize(search.value.trim());let visible=rows.filter(row=>normalize(row.textContent).includes(q));const mode=sort.value;if(mode!=='default'){const desc=mode.endsWith('desc'),key=mode.startsWith('title')?0:3;visible.sort((a,b)=>{const x=a.cells[key]?.textContent.trim()||'',y=b.cells[key]?.textContent.trim()||'';return (desc?-1:1)*x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'});});}for(const row of rows)row.hidden=true;for(const row of visible){row.hidden=false;table.tBodies[0].appendChild(row);}count.textContent=visible.length+' / '+rows.length+' records';}
search.addEventListener('input',render);sort.addEventListener('change',render);render();
})();