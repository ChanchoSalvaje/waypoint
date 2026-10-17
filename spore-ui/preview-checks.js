// Review controls and regression harness. This file NEVER enters the production bundle.
const toolsPanel=el('div','','preview-tools');
const testOutput=el('output');testOutput.id='test-output';
toolsPanel.append(button('Next art day',()=>{$('preview-day').click();}),button('Today’s art',()=>{$('reset-day').click();}),button('Long-content stress test',()=>{
 const long='A deliberately long synthetic title to check wrapping, reading order, and separation between the parts of the page '+ 'unbroken'.repeat(22);
 latestBrief.body='## Long-content layout check\n'+Array(4).fill('This fictional paragraph has the shape of a detailed daily brief. It must remain readable at narrow widths and with larger text. No part should cover the next section.').join(' ')+'\n\n1. '+long+'\nSource: https://example.com/'+ 'long-source-path-'.repeat(20)+'\n\n2. A second item after the long one\nAll of this text stays available.\n\n## End of the brief\nThe next card must begin below this line.';
 fixtures.commitments=[['2026-10-19',long,'Personal','personal'],['2026-10-23','The next commitment must remain separate','SAFOJ','safoj']];
 state.notes=Object.keys(names).map(section=>({id:'stress-'+section,section,body:latestBrief.body,at:new Date().toISOString()}));render();
}),button('Text size 200%',()=>{document.documentElement.style.fontSize=document.documentElement.style.fontSize?'':'200%';}),button('Run regression checks',()=>runReviewChecks()),testOutput);
toolsPanel.hidden=new URLSearchParams(location.search).has('review');
document.querySelector('.preview-banner').after(toolsPanel);
function layoutChecks(){
 const failures=[];const root=document.documentElement;if(root.scrollWidth>root.clientWidth+1)failures.push('Page horizontal overflow');
 for(const sel of ['.today-grid>div','.day-aside','#notes','#view','.spark-copy','.readable-body'])for(const parent of document.querySelectorAll(sel)){
  const kids=[...parent.children].filter(x=>x.getClientRects().length&&getComputedStyle(x).position!=='absolute');
  for(let i=1;i<kids.length;i++){const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();if(a.bottom>b.top+1&&Math.min(a.right,b.right)>Math.max(a.left,b.left)+1)failures.push('Sibling overlap in '+sel);}
 }
 for(const node of document.querySelectorAll('.readable-body,.appointment,.task-row,.note-entry,.spark-feature,.page-heading')){
  if(!node.getClientRects().length)continue;if(node.scrollWidth>node.clientWidth+1)failures.push('Content overflow '+node.className);
  if(node.scrollHeight>node.clientHeight+1&&['hidden','clip'].includes(getComputedStyle(node).overflowY))failures.push('Clipped content '+node.className);
 }
 for(const parent of document.querySelectorAll('.note-entry,.briefing,.spark-copy,.appointment')){
  if(!parent.getClientRects().length)continue;const bounds=parent.getBoundingClientRect();
  const walker=document.createTreeWalker(parent,NodeFilter.SHOW_TEXT);let text;
  while(text=walker.nextNode()){if(!text.textContent.trim())continue;let hidden=false;for(let a=text.parentElement;a;a=a.parentElement){if(a.tagName==='DETAILS'&&!a.open&&!a.querySelector('summary').contains(text)){hidden=true;break;}}if(hidden)continue;const range=document.createRange();range.selectNodeContents(text);for(const rect of range.getClientRects()){if(rect.width&&rect.height&&(rect.left<bounds.left-2||rect.right>bounds.right+2||rect.bottom>bounds.bottom+2))failures.push('Text escapes '+parent.className);}}
 }
 const view=document.getElementById('view'),notes=document.querySelector('.notes-area');if(view.getBoundingClientRect().bottom>notes.getBoundingClientRect().top+1)failures.push('View bleeds into notes');
 return failures;
}
async function runReviewChecks(){
 const checks=[];function check(name,ok){checks.push({name,passed:!!ok});}
 const originalActive=active,oldOffset=previewOffset,oldDayKey=DailySpark.dayKey,originalNote=$('note').value,originalDrafts={...noteDrafts};
 try{
  for(const section of Object.keys(names)){
   const art=[];select(section);
   for(let d=0;d<8;d++){previewOffset=d;render();const p=ArtCycle.resolve(section,selectedArtDay(),ArtCatalog);art.push(p.id);check(section+' day '+d+' complete asset',!!p.asset);const images=[...document.querySelectorAll('#panel img')];await Promise.all(images.map(img=>img.decode().catch(()=>{})));check(section+' day '+d+' images decode',images.every(img=>img.complete&&img.naturalWidth>0));const issues=layoutChecks();check(section+' day '+d+' layout '+[...new Set(issues)].join('; '),issues.length===0);}
   check(section+' seven distinct daily images',new Set(art.slice(0,7)).size===7);check(section+' repeats only on day eight',art[0]===art[7]);
  }
  select('today');previewOffset=0;render();for(const d of document.querySelectorAll('#spark-feature details'))d.open=true;check('Expanded reflection and story stay contained',layoutChecks().length===0);for(const d of document.querySelectorAll('#spark-feature details'))d.open=false;$('note').value='Unsaved synthetic draft';$('note').dispatchEvent(new Event('input'));$('note').focus();$('note').setSelectionRange(4,12);
  const plannerInput=$('available-minutes');plannerInput.value='35';const before=$('note'),selection=before.selectionStart,saved=JSON.stringify(state.notes),newDay=DailySpark.shift(oldDayKey(),1);DailySpark.dayKey=()=>newDay;refreshDailyPresentation();
  check('Midnight preserves note node, text, caret and focus',before===$('note')&&before.value==='Unsaved synthetic draft'&&before.selectionStart===selection&&document.activeElement===before);
  check('Midnight preserves planner input',plannerInput===$('available-minutes')&&plannerInput.value==='35');
  check('Midnight changes visible art date',$('art-caption').textContent.includes(newDay));
  check('Midnight does not write notes',JSON.stringify(state.notes)===saved);
  openTask(null,true);$('task-title').value='Unsaved task draft';$('task-title').focus();DailySpark.dayKey=()=>DailySpark.shift(newDay,1);refreshDailyPresentation();check('Midnight preserves task editor and draft',$('task-dialog').open&&$('task-title').value==='Unsaved task draft'&&document.activeElement===$('task-title'));closeTask();
  const fallback=imageContent(null,'personal',newDay);check('Missing asset gets labelled illustration',!!fallback.querySelector('svg')&&fallback.textContent.includes('unavailable'));
  const corrupt=imageContent({data:'data:image/png;base64,broken',alt:'Test'},'personal',newDay);corrupt.querySelector('img').dispatchEvent(new Event('error'));check('Broken image gets labelled illustration',!!corrupt.querySelector('svg'));
  const body=SporeBrief.renderBrief(document,'## Heading\n1. One\n\n2. Two\nSource: https://example.com/'+ 'a'.repeat(200)+'\n<script>unsafe</script>');
  check('Safe structured text, named link, no injected script',body.querySelector('h3')&&body.querySelectorAll('li').length===2&&body.querySelector('a').textContent==='example.com'&&!body.querySelector('script'));
 }finally{DailySpark.dayKey=oldDayKey;previewOffset=oldOffset;noteDrafts=originalDrafts;select(originalActive);$('note').value=originalNote;noteDrafts[active]=originalNote;render();}
 testOutput.dataset.viewport=JSON.stringify({width:innerWidth,height:innerHeight,fontSize:getComputedStyle(document.documentElement).fontSize});
 testOutput.textContent=checks.filter(c=>!c.passed).map(c=>'FAIL: '+c.name).join('\n')||'PASS: '+checks.length+' art, layout, safe-text, fallback and draft-preservation checks.';
 testOutput.dataset.results=JSON.stringify(checks);
}
