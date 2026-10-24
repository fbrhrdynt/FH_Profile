'use strict';
// Add missing ecosystem products only. Existing CMS entries remain authoritative.
const products = [
 ['files','Febro Files','Cloud file storage with folders, uploads, downloads, private sharing and Febro Account sign-in.','Cloud Storage,File Sharing,SSO'],
 ['auth','Febro Account','Central account service with email and Google sign-in, email verification and single sign-on for Febro applications.','Authentication,SSO,OpenID Connect'],
 ['tools','Febro Tools','Browser-based utilities for JSON, Base64, URL encoding, hashing, passwords, UUIDs and text analysis.','Developer Tools,JavaScript,Utilities'],
 ['qr','QR Studio','Create QR codes for links, text, Wi-Fi and contact cards, with PNG and SVG export.','QR Code,PNG,SVG'],
 ['convert','Document Converter','Merge and extract PDF pages, convert images to PDF, and turn text files into PDF documents.','PDF,Conversion,Documents'],
 ['short','URL Shortener','Create and manage short links with custom aliases, expiration, click statistics and account access.','Short Links,Analytics,Web App'],
 ['snip','Code Snippets','Save, organize and share code snippets with private and public visibility controls.','Code,Snippets,Sharing'],
 ['lab','Febro Labs','A showcase of practical projects, prototypes and experiments across software, automation and electronics.','Experiments,Prototypes,Automation'],
 ['api','Febro API','REST endpoints for UUIDs, QR codes and short links, with API key management for protected operations.','REST API,QR Code,Developer Tools'],
 ['docs','Febro Docs','Project documentation and API references, including guides and the OpenAPI specification.','Documentation,OpenAPI,Guides'],
 ['verify','QR Document Verification','Place verification QR codes on PDF documents and check published document metadata through a public verification page.','PDF,QR Code,Verification']
];
function addEcosystemProjects(db) {
 const insert = db.prepare(`INSERT OR IGNORE INTO entries
  (kind,slug,title,description,tags,category,year,url,access_mode)
  VALUES ('project',?,?,?,?, 'Febro Ecosystem','2026',?,'external')`);
 db.exec('BEGIN IMMEDIATE');
 try {
  let added = 0;
  for (const [host,title,description,tags] of products) {
   const url = `https://${host}.febro.id`;
   // Match canonical host as well as slug; never duplicate or overwrite an existing app.
   const existing = db.prepare(`SELECT id FROM entries WHERE kind='project'
    AND (slug=? OR lower(rtrim(url,'/'))=? OR lower(url) LIKE ?)`).get(`febro-${host}`,url,`${url}/%`);
   if (existing) continue;
   added += Number(insert.run(`febro-${host}`,title,description,tags,url).changes);
  }
  if (added) db.prepare(`INSERT OR IGNORE INTO project_categories(name,sort_order)
   VALUES ('Febro Ecosystem',(SELECT COALESCE(MAX(sort_order),0)+10 FROM project_categories))`).run();
  db.exec('COMMIT');
  return added;
 } catch (error) { db.exec('ROLLBACK'); throw error; }
}
module.exports = {addEcosystemProjects, products};
