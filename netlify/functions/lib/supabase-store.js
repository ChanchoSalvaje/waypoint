const { randomBytes } = require('node:crypto');
const { parseFilter, evaluate, restCondition, fieldId } = require('./record-filter');
let cached;
function enabled() {
  const mode=process.env.WAYPOINT_DATA_BACKEND || 'airtable';
  if(!['airtable','supabase'].includes(mode))throw new Error('Unknown tracker backend configuration.');
  return mode==='supabase';
}
const recordId = /^rec[A-Za-z0-9]{14}$/;
function config() {
  const url = (process.env.WAYPOINT_SUPABASE_URL || '').replace(/\/$/,'');
  const key = process.env.WAYPOINT_SUPABASE_SECRET_KEY || '';
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) || !key.startsWith('sb_secret_')) {
    throw Object.assign(new Error('Private tracker server access is not configured.'), {statusCode:503,code:'TRACKER_NOT_CONFIGURED'});
  }
  return {url,key};
}
async function api(path, options = {}) {
  const {url,key} = config();
  const response = await fetch(url + '/rest/v1/' + path, {
    ...options, signal: AbortSignal.timeout(15000),
    headers: {apikey:key,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},
  });
  if (!response.ok) throw Object.assign(new Error('Could not confirm the private tracker request. Refresh before retrying a write.'),
    {statusCode:response.status,code:'SUPABASE_REQUEST_FAILED'});
  const data = await response.json();
  return {data,response};
}
async function tables() {
  const {url,key} = config();
  if (cached && cached.url === url && cached.key === key && Date.now() - cached.at < 60000) return cached.rows;
  const {data} = await api('waypoint_tables?select=table_key,source_table_id,field_definitions');
  if (!Array.isArray(data) || !data.length) throw new Error('Tracker schema is not available.');
  cached = {url,key,at:Date.now(),rows:data}; return data;
}
async function tableFor(name) {
  const table = (await tables()).find(t => t.table_key === name || t.source_table_id === name);
  if (!table) throw Object.assign(new Error('Unknown tracker table.'),{statusCode:400});
  return table;
}
function mapped(row) {
  return {id:row.id,fields:row.fields || {},
    // Imported creation timestamps are genuinely unknown. Import time must not
    // make an old posting look new.
    createdTime:row.source_created_at || (row.source_export_id ? null : row.inserted_at)};
}
function paramsOf(input) {
  if (input instanceof URLSearchParams) return input;
  const p = new URLSearchParams();
  for (const [k,v] of Object.entries(input || {})) {
    if (Array.isArray(v)) v.forEach(item=>p.append(k,item)); else p.set(k,String(v));
  }
  return p;
}
function addCondition(query, condition) {
  const logic = condition.match(/^(and|or)\((.*)\)$/s);
  if (logic) query.set(logic[1],'('+logic[2]+')');
  // Quoted operands belong to PostgREST's logic grammar. In a standalone
  // column filter the quotes become part of the value and match no records.
  else query.set('and','('+condition+')');
}
async function list(name, input = {}) {
  const table = await tableFor(name), params = paramsOf(input);
  const formula = params.get('filterByFormula'), ast = formula ? parseFilter(formula) : null;
  const condition = ast ? restCondition(ast,table) : null;
  const sorts = [];
  for (let i=0;params.has(`sort[${i}][field]`);i++) sorts.push({id:fieldId(table,params.get(`sort[${i}][field]`)),desc:params.get(`sort[${i}][direction]`)==='desc'});
  const maximum = params.has('maxRecords') ? Number(params.get('maxRecords')) : Infinity;
  if (maximum !== Infinity && (!Number.isInteger(maximum) || maximum < 1 || maximum > 100000)) throw new Error('Invalid tracker read limit.');
  let rows = [], offset=0;
  const wanted = params.getAll('fields[]');
  const projection = new Set(wanted.map(name=>fieldId(table,name)));
  function addFilterFields(node) {
    if(!node)return;
    if(node.type==='field')projection.add(fieldId(table,node.name));
    if(node.args)node.args.forEach(addFilterFields);
    if(node.left)addFilterFields(node.left);if(node.right)addFilterFields(node.right);
  }
  if(wanted.length){addFilterFields(ast);sorts.forEach(s=>projection.add(s.id));}
  const selectedFields = wanted.length ? [...projection] : [];
  const select = ['id','source_created_at','source_export_id','inserted_at',
    ...(selectedFields.length ? selectedFields.map(id=>id+':fields->'+id) : ['fields'])].join(',');
  for (let page=0;page<200;page++) {
    const query = new URLSearchParams({select,table_key:'eq.'+table.table_key,order:'id.asc',limit:'500',offset:String(offset)});
    if (condition) addCondition(query,condition);
    // A limit can be pushed down only when the filter is fully represented.
    if (!ast || condition) {
      if (sorts.length) query.set('order',sorts.map(s=>'fields->'+s.id+'.'+(s.desc?'desc':'asc')+'.nullslast').concat('id.asc').join(','));
      query.set('limit',String(Math.min(500,maximum-offset)));
    }
    const {data} = await api('waypoint_records?'+query);
    if (!Array.isArray(data)) throw new Error('Incomplete tracker response.');
    rows.push(...data.map(row=>mapped(selectedFields.length ? {...row,fields:Object.fromEntries(selectedFields.filter(id=>Object.hasOwn(row,id)).map(id=>[id,row[id]]))} : row))); offset+=data.length;
    if (data.length < Number(query.get('limit')) || ((!ast || condition) && offset>=maximum)) break;
    if (page===199) throw new Error('Refusing a partial tracker read.');
  }
  if (ast) rows = rows.filter(r=>evaluate(ast,r,table));
  if (sorts.length) rows.sort((a,b)=>{
    for (const sort of sorts) {
      const x=a.fields[sort.id],y=b.fields[sort.id];
      if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;
      if(x!==y) return (x<y?-1:1)*(sort.desc?-1:1);
    } return a.id.localeCompare(b.id);
  });
  rows = rows.slice(0,maximum);
  const selected=params.getAll('fields[]');
  if (selected.length) {
    const ids=selected.map(name=>fieldId(table,name));
    rows=rows.map(r=>({...r,fields:Object.fromEntries(ids.filter(id=>Object.hasOwn(r.fields,id)).map(id=>[id,r.fields[id]]))}));
  }
  return rows;
}
function fieldsFor(table,fields) {
  if (!fields || typeof fields!=='object' || Array.isArray(fields)) throw Object.assign(new Error('A field object is required.'),{statusCode:400});
  return Object.fromEntries(Object.entries(fields).map(([name,value])=>{
    const id=fieldId(table,name),definition=table.field_definitions.find(f=>f.id===id);
    if(value!==null){
      let valid;
      switch(definition.type){
        case 'Checkbox':valid=typeof value==='boolean';break;
        case 'Number':valid=typeof value==='number'&&Number.isFinite(value);break;
        case 'Date':valid=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)?$/.test(value)&&Number.isFinite(Date.parse(value));break;
        case 'Multiple select':valid=Array.isArray(value)&&value.every(v=>typeof v==='string');break;
        case 'Link to another record':valid=Array.isArray(value)&&new Set(value).size===value.length&&value.every(v=>recordId.test(v));break;
        case 'Attachment':valid=Array.isArray(value);break;
        case 'User':valid=typeof value==='object'&&!Array.isArray(value);break;
        default:valid=typeof value==='string';
      }
      if(!valid)throw Object.assign(new Error('Invalid value for tracker field.'),{statusCode:400});
    }
    return [id,value];
  }));
}
async function write(name, entries, method='POST') {
  const table=await tableFor(name);
  if (!Array.isArray(entries) || !entries.length) throw new Error('A record batch is required.');
  if(method==='POST') {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const payload=entries.map(entry=>({id:entry.id || 'rec'+Array.from(randomBytes(14),byte=>alphabet[byte%alphabet.length]).join(''),table_key:table.table_key,fields:fieldsFor(table,entry.fields)}));
    if(payload.some(r=>!recordId.test(r.id)))throw Object.assign(new Error('Invalid record ID.'),{statusCode:400});
    const {data}=await api('waypoint_records',{method:'POST',body:JSON.stringify(payload)});
    if(!Array.isArray(data)||data.length!==entries.length)throw new Error('Unconfirmed record create; reconcile before retrying.');
    return data.map(mapped);
  }
  if(method!=='PATCH')throw Object.assign(new Error('Unsupported tracker write.'),{statusCode:405});
  const result=[];
  for(const entry of entries) {
    if(!recordId.test(entry.id))throw Object.assign(new Error('Invalid record ID.'),{statusCode:400});
    const {data}=await api('rpc/waypoint_patch_record',{method:'POST',body:JSON.stringify({
      p_id:entry.id,p_table_key:table.table_key,p_patch:fieldsFor(table,entry.fields),
      p_expected:entry.expectedFields ? fieldsFor(table,entry.expectedFields) : null,
    })});
    if(!Array.isArray(data)||data.length!==1)throw Object.assign(new Error('The record changed or is unavailable. Refresh before choosing again.'),{statusCode:entry.expectedFields?409:404});
    result.push(mapped(data[0]));
  }
  return result;
}
async function request(path,options={}) {
  const url=new URL('https://tracker.invalid/'+path),parts=url.pathname.slice(1).split('/');
  if(parts.length>2)throw new Error('Invalid tracker path.');
  const table=await tableFor(parts[0]),id=parts[1],method=options.method||'GET';
  if(method==='GET') {
    if(id) {
      if(!recordId.test(id))throw Object.assign(new Error('Invalid record ID.'),{statusCode:400});
      const q=new URLSearchParams({select:'*',id:'eq.'+id,table_key:'eq.'+table.table_key});
      const {data}=await api('waypoint_records?'+q);
      if(!Array.isArray(data)||data.length!==1)throw Object.assign(new Error('Record not found.'),{statusCode:404});
      return mapped(data[0]);
    }
    const offset=url.searchParams.get('offset')||'sb:0';
    if(!/^sb:\d+$/.test(offset))throw new Error('Invalid tracker page.');
    const start=Number(offset.slice(3)),size=Math.min(100,Number(url.searchParams.get('pageSize'))||100);
    const ast=url.searchParams.has('filterByFormula')?parseFilter(url.searchParams.get('filterByFormula')):null;
    const condition=ast?restCondition(ast,table):null;
    if(!ast||condition){
      const maximum=url.searchParams.has('maxRecords')?Number(url.searchParams.get('maxRecords')):Infinity;
      if(maximum!==Infinity&&(!Number.isInteger(maximum)||maximum<1))throw new Error('Invalid tracker limit.');
      const limit=Math.min(size,maximum-start);
      if(limit<=0)return {records:[]};
      const query=new URLSearchParams({select:'id,fields,source_created_at,source_export_id,inserted_at',
        table_key:'eq.'+table.table_key,order:'id.asc',offset:String(start),limit:String(limit)});
      if(condition)addCondition(query,condition);
      const {data,response}=await api('waypoint_records?'+query,{headers:{Prefer:'count=exact'}});
      if(!Array.isArray(data))throw new Error('Incomplete tracker page.');
      const total=Number(response.headers?.get('content-range')?.split('/')[1]);
      const more=Number.isFinite(total)?start+data.length<Math.min(total,maximum):data.length===limit&&start+data.length<maximum;
      return {records:data.map(mapped),...(more?{offset:'sb:'+(start+data.length)}:{})};
    }
    const all=await list(parts[0],url.searchParams);
    return {records:all.slice(start,start+size),...(start+size<all.length?{offset:'sb:'+(start+size)}:{})};
  }
  const input=JSON.parse(options.body||'{}');
  const entries=id?[{id,fields:input.fields,expectedFields:input.expectedFields}]:input.records;
  const result=await write(parts[0],entries,method);
  return id?result[0]:{records:result};
}
module.exports={enabled,list,write,request,config,clearCache:()=>{cached=null;}};
