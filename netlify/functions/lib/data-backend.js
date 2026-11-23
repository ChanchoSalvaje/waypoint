// Compatibility transport: existing endpoint validation/mapping stays in place.
// Supabase errors never fall back to Airtable or transmit the Supabase key there.
const store = require('./supabase-store');
function serverToken() {
  if (!store.enabled()) return process.env.AIRTABLE_TOKEN;
  try { store.config(); return 'private-tracker-configured'; } catch { return null; }
}
async function dataFetch(input,options={}) {
  if(!store.enabled())return fetch(input,options);
  const url=new URL(String(input));
  const match=url.pathname.match(/^\/v0\/appUQQ4gnT7UuFOOm\/(tbl[A-Za-z0-9]+)(\/rec[A-Za-z0-9]{14})?$/);
  if(url.protocol!=='https:'||url.hostname!=='api.airtable.com'||!match)throw new Error('Unsupported tracker transport path.');
  try {
    const data=await store.request(match[1]+(match[2]||'')+url.search,options);
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  } catch(error) {
    return new Response(JSON.stringify({error:error.message,code:error.code||'TRACKER_REQUEST_FAILED'}),
      {status:error.statusCode||502,headers:{'Content-Type':'application/json'}});
  }
}
module.exports={dataFetch,serverToken};
