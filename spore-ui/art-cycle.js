/* Deterministic seven-day curation. Captions are original prompts, not claims of artist intent. */
(function(root){
 'use strict';
 const ids=['atkins','durer','blake','cypresses','pitcher','wave','oxbow'];
 const offsets={today:0,career:1,safoj:2,personal:3,writing:4};
 const titles={atkins:'Look closely',durer:'Check the picture',blake:'Leave room for wonder',cypresses:'Find a steady point',pitcher:'Care in ordinary things',wave:'The next stroke',oxbow:'A little perspective'};
 const themes={today:'A moment of attention',career:'Practice & perspective',safoj:'Symbols & conversation',personal:'Room for ordinary life',writing:'An image to begin with'};
 const captions={
  atkins:['Look closely before deciding what matters.','Make a direct record of the work you can show.','Let a small detail open a larger conversation.','Leave a little space for the living world.','Describe the branching shape before giving it a story.'],
  durer:['A vivid picture is an invitation to check the evidence.','Separate what you know from what you have been told.','What changes when a story travels between people?','An unfamiliar creature can renew a familiar day.','Give a familiar animal one impossible feature.'],
  blake:['A larger view can coexist with one small next step.','Keep the long view beside the work in front of you.','Notice the distance between a symbol and its possible meanings.','Make room for wonder without needing an answer.','Begin with the small figure beneath the enormous one.'],
  cypresses:['Notice something steady in a restless scene.','Let steady practice carry the work forward.','How can stillness and movement share an image?','Take a moment to notice a tree, a cloud, a patch of light.','Describe a still object using verbs of motion.'],
  pitcher:['An ordinary gesture can deserve your full attention.','Give one routine step the care it needs.','What does a threshold invite us to notice?','A small act of care is part of the day, too.','Write the moment just before the window opens.'],
  wave:['Choose the next manageable stroke.','Find the next move within conditions you cannot control.','Hold the wave and the distant mountain in the same view.','Leave room in the plan for changing conditions.','Tell the scene from the boat, then from the mountain.'],
  oxbow:['Step back far enough to see the bend in the river.','Consider the terrain before choosing a route.','Whose view of a place becomes its shared story?','Leave an unhurried stretch in the week ahead.','Describe the same landscape from two different banks.']
 };
 function dayNumber(key){const n=Math.floor(Date.parse(key+'T12:00:00Z')/86400000);return Number.isFinite(n)?n:0;}
 function choose(section,key){const sectionIndex=Object.keys(offsets).indexOf(section),i=sectionIndex<0?0:sectionIndex;const id=ids[((dayNumber(key)+i)%7+7)%7];return {id,theme:section==='today'?titles[id]:(themes[section]||themes.today),caption:captions[id][i]};}
 function resolve(section,key,catalog){const pick=choose(section,key),asset=catalog[pick.id];return {...pick,asset:asset&&asset.data&&asset.alt&&asset.credit?asset:null};}
 // Phoenix has no DST. Schedule just after the next local midnight, re-check on wake/focus.
 function untilMidnight(now=new Date()){const next=new Date(now.getTime()+86400000);const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(next);const key=['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');return Math.max(250,Date.parse(key+'T00:00:00-07:00')-now.getTime()+100);}
 const api={choose,resolve,untilMidnight,ids};if(typeof module==='object'&&module.exports)module.exports=api;else root.ArtCycle=api;
})(typeof globalThis==='object'?globalThis:this);
