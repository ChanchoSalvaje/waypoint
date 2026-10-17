const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const cycle=require('./art-cycle.js'),spark=require('./spark.js'),root=path.resolve(__dirname,'..');
test('Arizona date rolls at 07:00 UTC, including year boundary',()=>{
 for(const [a,b,key] of [['2026-10-17T06:59:59Z','2026-10-17T07:00:00Z','2026-10-17'],['2027-01-01T06:59:59Z','2027-01-01T07:00:00Z','2027-01-01']]){
 assert.equal(spark.dayKey(new Date(b)),key);assert.equal(spark.shift(spark.dayKey(new Date(a)),1),key);assert.equal(cycle.untilMidnight(new Date(a)),1100);
 }
});
test('all sections get seven distinct works and distinct art on a shared day',()=>{
 const sections=['today','career','safoj','personal','writing'];
 for(let i=0;i<30;i++){const day=spark.shift('2026-10-01',i);assert.equal(new Set(sections.map(s=>cycle.choose(s,day).id)).size,5);for(const s of sections){const week=Array.from({length:7},(_,j)=>cycle.choose(s,spark.shift(day,j)).id);assert.equal(new Set(week).size,7);assert.equal(cycle.choose(s,spark.shift(day,7)).id,week[0]);}}
});
test('missing/invalid asset resolves to explicit fallback, preserving meaningful caption',()=>{for(const s of ['today','career','safoj','personal','writing']){const r=cycle.resolve(s,'2026-10-17',{});assert.equal(r.asset,null);assert.ok(r.caption.length>20);}});
test('auth SDK/security unchanged; bridge and shell contain only reviewed presentation changes',()=>{
 const before=cp.execFileSync('git',['show','f7c95266949d644e96647369c5b95189aeef7a0f:public/spore/app.js'],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024}),after=fs.readFileSync(path.join(root,'public/spore/app.js'),'utf8');
 const oldStart=before.indexOf("(function(root){\n  'use strict';\n  function safeURL");
 assert.equal(after.slice(0,after.indexOf('/* BEGIN SPORE PRESENTATION */')),before.slice(0,oldStart));
 const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));
 assert.equal(slice(after,'function payload(t)','$(\'login-form\')'),slice(before,'function payload(t)','$(\'login-form\')'),'revision-checked task/note save path unchanged');
 assert.equal(slice(after,"$('login-form').addEventListener", "$('retry-auth').addEventListener"),slice(before,"$('login-form').addEventListener", "$('retry-auth').addEventListener"),'sign-in and password handlers unchanged');
 const headers=cp.execFileSync('git',['show','f7c95266949d644e96647369c5b95189aeef7a0f:public/_headers'],{cwd:root,encoding:'utf8'});assert.equal(fs.readFileSync(path.join(root,'public/_headers'),'utf8'),headers);
 assert.ok(!after.includes('const fakeStore='));assert.ok(!after.includes('runReviewChecks'));assert.ok(!after.includes('preview-tools'));
});
test('all four new museum images have recorded public-domain metadata and JPEG bytes',()=>{
 for(const id of [437980,437881,39799,10497]){const m=JSON.parse(fs.readFileSync(path.join(__dirname,'assets',id+'.json')));assert.equal(m.isPublicDomain,true);const b=fs.readFileSync(path.join(__dirname,'assets',id+'.jpg'));assert.equal(b[0],255);assert.equal(b[1],216);}
});
