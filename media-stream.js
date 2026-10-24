'use strict';
const {remote}=require('./media-client');
async function stream(req,res,db,auth,id,action){
 const row=db.prepare('SELECT f.*,e.enabled FROM entry_files f JOIN entries e ON e.id=f.entry_id WHERE f.id=?').get(id);
 if(!row){res.writeHead(404);return res.end();}
 const isAdmin=Boolean(auth);
 const publicAllowed=row.visibility==='public'&&!row.requestable&&row.enabled===1&&(action==='preview'?(row.allow_preview||row.allow_download):row.allow_download);
 if(!isAdmin&&!publicAllowed){res.writeHead(404);return res.end();}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 try{
  const route='/api/integrations/v1/files/'+row.remote_id+'/'+action;
  const response=await remote('GET',route);
  const type=action==='preview'?row.mime_type:'application/octet-stream';
  if(action==='preview'&&!['image/png','image/jpeg','image/webp','application/pdf'].includes(type)){res.writeHead(415);return res.end();}
  const name=String(row.original_name).replace(/[\r\n"\\]/g,'_').slice(0,130);
  res.writeHead(200,{'Content-Type':type,'Content-Disposition':(action==='preview'?'inline':'attachment')+'; filename="'+name+'"','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});
  if(req.method==='HEAD'){await response.body?.cancel();return res.end();}
  for await(const chunk of response.body){if(res.destroyed)break;if(!res.write(chunk))await new Promise(resolve=>res.once('drain',resolve));}
  res.end();
 }catch(e){if(!res.headersSent){res.writeHead(502);res.end('Storage unavailable');}else res.destroy();}
}
module.exports={stream};
