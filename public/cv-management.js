'use strict';
const cvUploadScript=document.currentScript;
document.querySelector('#cv-upload')?.addEventListener('submit',e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),status=document.querySelector('#cv-upload-status'),file=document.querySelector('#cv-file').files[0];
 if(button.disabled||!file)return;
 if(file.size>20e6){status.textContent='PDF exceeds 20 MB';return;}
 if(!/\.pdf$/i.test(file.name)){status.textContent='Select a PDF file';return;}
 button.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Uploading… 0%';
 const xhr=new XMLHttpRequest();xhr.open('POST',form.action);xhr.timeout=180000;
 xhr.setRequestHeader('X-CSRF-Token',cvUploadScript.dataset.csrf);
 const fail=message=>{status.textContent=message;button.disabled=false;form.removeAttribute('aria-busy');};
 xhr.upload.onprogress=event=>{status.textContent=event.lengthComputable?'Uploading… '+Math.round(event.loaded/event.total*100)+'% (saving to private storage)':'Uploading…';};
 xhr.onload=()=>{if(xhr.status===201){status.textContent='CV saved. Refreshing…';location.reload();}else fail(xhr.status===403?'Your session expired. Reload this page and try again.':xhr.responseText&&!/^\s*</.test(xhr.responseText)?xhr.responseText:'Upload failed ('+xhr.status+'). Reload the page and try again.');};
 xhr.onerror=()=>fail('Network error. Check your connection and try again.');
 xhr.ontimeout=()=>fail('Upload timed out. Reload to check Version History before retrying.');
 xhr.onabort=()=>fail('Upload cancelled.');
 xhr.send(new FormData(form));
});
