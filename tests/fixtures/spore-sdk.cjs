// Exercise the exact shipped adapter with a mocked client; no outbound requests allowed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=fs.readFileSync(path.resolve(__dirname,'../../public/spore/app.js'),'utf8').split('/* BEGIN SPORE PRESENTATION */')[0];
module.exports=vm.runInNewContext(js+';SporeSDK;', {URL,structuredClone,TextEncoder,TextDecoder,crypto:globalThis.crypto,setTimeout,clearTimeout,console,AbortController,Headers,Request,Response,fetch:()=>{throw Error('Network forbidden in SDK fixture');}});
