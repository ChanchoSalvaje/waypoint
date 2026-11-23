// Protected by the existing site-wide edge authentication gate. Read-only:
// verify server configuration without returning records, credentials, or URLs.
const {config,list}=require('./lib/supabase-store');
const {json}=require('./lib/airtable');
exports.handler=async event=>{
 if(event.httpMethod&&event.httpMethod!=='GET')return json(405,{error:'Use GET.'});
 try{
  config();
  const settings=await list('settings',{maxRecords:'2'});
  if(settings.length!==1)return json(503,{connection:'unconfirmed',error:'Expected exactly one active settings record.'});
  return json(200,{connection:'verified',backend:process.env.WAYPOINT_DATA_BACKEND||'airtable',serverOnly:true,asOf:new Date().toISOString()});
 }catch{return json(503,{connection:'unconfirmed',error:'Private database connection could not be verified.'});}
};
