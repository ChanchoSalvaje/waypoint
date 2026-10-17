/* Shared calendar-ingestion and display policy. No records are mutated. */
(function(root){
 'use strict';
 function titleKey(title){return typeof title==='string'?title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,''):'';}
 const excluded=new Set(['luzwork','allergydrop','2tinjection']);
 function excludedCalendarTitle(title){return excluded.has(titleKey(title));}
 function calendarItems(items){return (Array.isArray(items)?items:[]).filter(c=>!excludedCalendarTitle(c?.title));}
 function visibleText(text){return typeof text==='string'?text.split('\n').filter(line=>!excludedCalendarTitle(line)).join('\n'):'';}
 function jungRelated(row){return row?.section==='safoj'||/(?:^|[^\p{L}\p{N}])(?:safoj|jung|jungian)(?=$|[^\p{L}\p{N}])/iu.test([row?.title,row?.body,row?.why,row?.nextAction,row?.next_action].filter(Boolean).join('\n').split('\n').filter(line=>!/^\s*Reviewed\b/i.test(line)).join('\n'));}
 function route(section){return section==='personal'?'today':section;}
 const api={titleKey,excludedCalendarTitle,calendarItems,visibleText,jungRelated,route};if(typeof module==='object')module.exports=api;else root.SporeContentPolicy=api;
})(typeof globalThis==='object'?globalThis:this);
