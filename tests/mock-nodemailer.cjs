'use strict';
const Module=require('node:module');
const fs=require('node:fs');
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='nodemailer')return {createTransport(){return {async sendMail(message){
  if(process.env.FH_MAIL_TEST_FAIL_FILE&&fs.existsSync(process.env.FH_MAIL_TEST_FAIL_FILE))throw Error('Simulated delivery failure');
  fs.appendFileSync(process.env.FH_MAIL_TEST_LOG,JSON.stringify(message)+'\n');return {messageId:'mock-email'};
 }}}};
 return original.apply(this,arguments);
};
