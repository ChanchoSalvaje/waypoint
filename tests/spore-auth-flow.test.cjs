const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bundle=fs.readFileSync(require('node:path').join(__dirname,'../public/spore/app.js'),'utf8');
const end=bundle.indexOf('\n})();',bundle.indexOf('// auth-flow.mjs'))+7;
test('production bundle preserves pending PKCE through rate limit and performs one manual exchange',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let queue=Promise.resolve(),sends=0,exchanges=0;
 const context={btoa,atob,WebSocket,URL,URLSearchParams,Response,Headers,Request,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,console,crypto:require('node:crypto').webcrypto,localStorage:storage,navigator:{locks:{request:(_,fn)=>{const n=queue.then(fn);queue=n.catch(()=>{});return n;}}},fetch:async(url)=>{
 if(new URL(url).pathname.endsWith('/otp')){assert.equal(new URL(url).searchParams.get('redirect_to'),'https://waypoint-hq.netlify.app/spore/');sends++;return new Response(JSON.stringify(sends===1?{}:{code:'over_email_send_rate_limit',msg:'synthetic rate limit'}),{status:sends===1?200:429,headers:{'X-Supabase-Api-Version':'2024-01-01'}});}
 exchanges++;return new Response(JSON.stringify({code:'bad_code',msg:'synthetic exchange reached server'}),{status:400,headers:{'X-Supabase-Api-Version':'2024-01-01'}});
 }};
 vm.createContext(context);vm.runInContext(bundle.slice(0,end),context);
 const sdk=context.SporeSDK;
 const client=sdk.publicClient((url,key,options)=>sdk.createClient(url,key,{...options,auth:{...options.auth,storage,autoRefreshToken:false}}),{url:'https://ujsliyqjzyofcytcemhs.supabase.co',publishableKey:'sb_publishable_synthetic',redirectTo:sdk.CALLBACK});
 const adapter=sdk.createAdapter(client,{redirectTo:sdk.CALLBACK});
 await adapter.requestSignIn('synthetic@example.test');const pending=values.get('spore-auth-v1-code-verifier');assert.ok(pending);
 await assert.rejects(adapter.requestSignIn('synthetic@example.test'),/temporarily limited/);
 assert.ok(values.get('spore-auth-v1-code-verifier')===pending,'pending verifier preserved');
 let cleaned=false;await assert.rejects(sdk.finishReturn(client.auth,sdk.CALLBACK+'?code=synthetic',()=>cleaned=true),/AUTH_RETURN_FAILED/);
 assert.ok(cleaned);assert.equal(exchanges,1);adapter.dispose();await client.auth.stopAutoRefresh();
});
