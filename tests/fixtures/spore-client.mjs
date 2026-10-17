export function fake(){
  const db={spore_members:[{user_id:'tim',active:true}],spore_tasks:[],spore_notes:[],spore_briefs:[],spore_history:[]};
  const f={db,user:{id:'tim',is_anonymous:false,email:'tim.masters@gmail.com',email_confirmed_at:'2026-10-12T00:00:00Z'},error:null,hold:null,callback:()=>{},calls:[],next:null};
  const client={auth:{getUser:async()=>({data:{user:f.user},error:null}),onAuthStateChange(cb){f.callback=cb;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{f.callback('SIGNED_OUT',null);return {error:null};},signInWithOtp:async args=>{f.signIn=args;return {error:null};}},from(table){
    let action='select',payload,filters=[],range;
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},range(a,b){range=[a,b];return q;},insert(v){action='insert';payload=v;return q;},update(v){action='update';payload=v;return q;},maybeSingle(){return run(true);},then(resolve,reject){return run(false).then(resolve,reject);}};
    async function run(single){f.calls.push({table,action,payload,filters});if(f.hold)await f.hold;if(f.error)return {data:null,error:f.error};if(f.next){const r=f.next;f.next=null;return r;}
      let rows=db[table].filter(r=>filters.every(([k,v])=>r[k]===v));
      if(action==='insert'){if(db[table].some(r=>r.id===payload.id))return {error:{code:'23505'}};const row={revision:0,...payload};db[table].push(row);rows=[row];}
      if(action==='update')for(const r of rows)Object.assign(r,payload);
      if(range)rows=rows.slice(range[0],range[1]+1);return {data:structuredClone(single?(rows[0]??null):rows),error:null};
    }return q;
  }};return {f,client};
}