'use strict';
const crypto=require('node:crypto');
const { db }=require('./db');
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')) {return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;}
function verifyPassword(password,hash) { try{const [salt,digest]=hash.split(':');const one=Buffer.from(digest,'hex'),two=crypto.scryptSync(password,salt,one.length);return one.length===two.length && crypto.timingSafeEqual(one,two);}catch{return false;} }
if(require.main===module) {
 if(process.argv[2]!=='create-admin') {console.error('Usage: npm run admin:create -- --email you@example.com');process.exit(1);}
 const emailIndex=process.argv.indexOf('--email'); const email=emailIndex>=0?String(process.argv[emailIndex+1]||'').trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {console.error('Provide valid --email');process.exit(1);}
 if(!process.stdin.isTTY) {console.error('Run this command in an interactive terminal to enter the password securely.');process.exit(1);}
 process.stdout.write('New admin password (min 12 characters): ');
 let input='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 process.stdin.on('data',ch=>{if(ch==='\u0003')process.exit(130);if(ch==='\r'||ch==='\n'){process.stdout.write('\n');process.stdin.setRawMode(false);process.stdin.pause();if(input.length<12){console.error('Password too short.');process.exit(1);}db.prepare('INSERT INTO admins(email,password_hash) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash').run(email,hashPassword(input));console.log('Admin saved. Visit /admin/login');input='';return;} if(ch==='\u007f'){input=input.slice(0,-1);}else{input+=ch;}});
}
module.exports={hashPassword,verifyPassword};
