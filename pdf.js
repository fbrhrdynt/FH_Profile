'use strict';
// Zero-dependency text PDF renderer with page breaks and embedded standard Helvetica fonts.
function cvPDF(site, experiences, education, certifications, skills) {
 const pages=[]; let commands=[], y=789;
 const esc=t=>String(t||'').normalize('NFKD').replace(/[^\x20-\x7e]/g,'-').replace(/[\\()]/g,'\\$&');
 const newPage=()=>{if(commands.length)pages.push(commands.join('\n'));commands=[];y=795;};
 const line=(text,size=10,bold=false,indent=0,color='0.17 0.25 0.39')=>{
 if(y<65)newPage(); commands.push(`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${50+indent} ${y} Tm (${esc(text).slice(0,115)}) Tj ET`);y-=size+7;};
 const wrap=(text,max=91,size=9,indent=0)=>{let words=String(text||'').replace(/\s+/g,' ').split(' '),row='';for(const w of words){if((row+' '+w).trim().length>max && row){line(row,size,false,indent);row=w;}else row+=(row?' ':'')+w;}if(row)line(row,size,false,indent);};
 line(site.site_name||'Febro Herdyanto',23,true,0,'0.09 0.25 0.62');
 line(site.site_tagline||'',11,true);line([site.location,site.email,site.github].filter(Boolean).join('  |  '),8);y-=8;
 line('PROFILE',11,true,0,'0.09 0.25 0.62');wrap(site.cv_summary,105,9);y-=9;
 line('PROFESSIONAL EXPERIENCE',11,true,0,'0.09 0.25 0.62');
 for(const e of experiences){line(`${e.title}  |  ${e.company}`,10,true);line(e.period,8,false,0,'0.39 0.48 0.61');wrap(e.description,102,9);for(const bullet of (e.body||'').split('\n').filter(Boolean).slice(0,4))wrap('- '+bullet,105,8,6);y-=7;}
 line('EDUCATION',11,true,0,'0.09 0.25 0.62');for(const e of education){line(e.title+'  |  '+e.company,10,true);line(`${e.period}  ${e.description}`,9);}y-=7;
 line('TECHNICAL SKILLS',11,true,0,'0.09 0.25 0.62');for(const [group,values] of Object.entries(skills)){line(group.toUpperCase(),9,true);wrap(values.join(', '),107,8);y-=4;}
 if(certifications.length){y-=8;line('CERTIFICATIONS',11,true,0,'0.09 0.25 0.62');for(const c of certifications)line(c.title,9);}
 newPage();
 const count=pages.length,objs=['','',`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${5+i*2} 0 R`).join(' ')}] /Count ${count} >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`];
 // Use fixed object slots: 1 catalog, 2 pages, 3 font, 4 bold font; 5+ pages / streams.
 const dict={1:objs[2],2:objs[3],3:objs[4],4:objs[5]};
 for(let i=0;i<count;i++){const p=5+i*2,s=6+i*2,stream=pages[i];dict[p]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${s} 0 R >>`;dict[s]=`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`;}
 let pdf='%PDF-1.4\n', offsets=[0];for(let i=1;i<=4+count*2;i++){offsets[i]=Buffer.byteLength(pdf,'latin1');pdf+=`${i} 0 obj\n${dict[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf,'latin1');pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf,'latin1');
}
module.exports={cvPDF};
