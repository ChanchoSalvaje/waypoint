/* Safe, deliberately small text renderer. Saved bodies are never rewritten. */
(function(root){
 'use strict';
 function safeURL(value){
  if(!/^https:\/\//i.test(value)||/[\s\\\u0000-\u001f\u007f]/.test(value))return null;
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:null;}catch{return null;}
 }
 function sourceName(url){const u=new URL(url),h=u.hostname;return h==='mail.google.com'?'Email source':h==='calendar.google.com'||(h==='www.google.com'&&u.pathname.startsWith('/calendar/'))?'Calendar event':h.includes('airtable.com')?'Airtable record':h.replace(/^www\./,'');}
 function inline(doc,node,text){
  const pattern=/\[([^\]\r\n]+)\]\(([^\s()]+)\)|(https:\/\/[^\s<>]+)/g;let start=0;
  for(const match of text.matchAll(pattern)){
   node.append(doc.createTextNode(text.slice(start,match.index)));
   const raw=match[2]||match[3],url=match[3]?raw.replace(/[.,;!?]+$/,''):raw,href=safeURL(url);
   if(href){const a=doc.createElement('a');a.textContent=match[1]||sourceName(href);a.href=href;a.title=href;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';node.append(a);if(match[3])node.append(doc.createTextNode(raw.slice(url.length)));}
   else node.append(doc.createTextNode(match[0]));
   start=match.index+match[0].length;
  }
  node.append(doc.createTextNode(text.slice(start)));
 }
 function renderBrief(doc,body){
  const container=doc.createElement('div');container.className='readable-body';
  let paragraph=null,list=null,item=null;
  for(const line of String(body??'').split(/\r?\n/)){
   if(!line.trim()){paragraph=list=item=null;continue;}
   const heading=line.match(/^#{1,6}\s+(.+)$/)||line.match(/^(.{1,100} • [A-Za-z]+ \d{1,2}, \d{4} • Arizona)$/),number=line.match(/^(\d+)[.)]\s+(.+)$/),bullet=line.match(/^[-*•]\s+(.+)$/);
   if(heading){const h=doc.createElement('h3');inline(doc,h,heading[1]);container.append(h);paragraph=list=item=null;continue;}
   if(number||bullet){const kind=number?'ol':'ul';if(!list||list.tagName.toLowerCase()!==kind){list=doc.createElement(kind);if(number)list.start=Number(number[1]);container.append(list);}item=doc.createElement('li');inline(doc,item,number?number[2]:bullet[1]);list.append(item);paragraph=null;continue;}
   if(item){item.append(doc.createElement('br'));inline(doc,item,line);continue;}
   if(!paragraph){paragraph=doc.createElement('p');container.append(paragraph);}else paragraph.append(doc.createElement('br'));
   inline(doc,paragraph,line);
  }
  return container;
 }
 const api={renderBrief,safeURL,sourceName};if(typeof module==='object'&&module.exports)module.exports=api;else root.SporeBrief=api;
})(typeof globalThis==='object'?globalThis:this);
