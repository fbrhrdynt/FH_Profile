'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const media=require('../media-client');
test('supported roles include certificate and cover',()=>{assert.equal(media.roles.has('certificate'),true);assert.equal(media.roles.has('cover'),true)});
test('service token is required',()=>{const original=process.env.FEBRO_PROFILE_SERVICE_TOKEN;delete process.env.FEBRO_PROFILE_SERVICE_TOKEN;assert.throws(()=>media.remote('GET','/api/integrations/v1/files/none'),/./);if(original)process.env.FEBRO_PROFILE_SERVICE_TOKEN=original});
