'use strict';
const fs=require('node:fs'),path=require('node:path');
if(typeof process.loadEnvFile==='function'&&fs.existsSync(path.join(__dirname,'../.env')))process.loadEnvFile(path.join(__dirname,'../.env'));
const mail=require('../mail');
if(!mail.smtpReady()){console.error('SMTP is not configured. Run bash deploy/configure-smtp.sh');process.exit(1);}
const nodemailer=require('nodemailer');
const port=Number(process.env.SMTP_PORT||465),secure=process.env.SMTP_SECURE==='true';
const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure,requireTLS:!secure&&process.env.SMTP_STARTTLS!=='false',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000});
transporter.verify().then(()=>{console.log('SMTP authentication and connection OK. No test email was sent.');transporter.close();},e=>{console.error('SMTP test failed:',e.message);transporter.close();process.exitCode=1;});
