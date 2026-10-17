/* Original artwork and reflection prompts. No divination, diagnosis or network. */
(function(root){
 'use strict';
 const reflections=[
  ['The Hermit','The seeker','A lantern lights a few steps, not the whole road. Quiet attention can be useful without becoming withdrawal.','If you feel like reflecting: what deserves ten unhurried minutes?','The overlooked detail','Imagine a museum label for an ordinary object near you. What would a future visitor misunderstand about its place in your life?'],
  ['The Magician','The maker','Tools become meaningful through use. Notice a capacity already available rather than searching for a missing one.','What small thing could you make with what is already at hand?','History from the margins','Choose an era you are curious about. What question would a cook, builder or child ask that a ruler might never think to record?'],
  ['The Star','The renewer','A point of light need not explain the darkness to offer orientation. This image can be a starting point for possibility.','What quietly restores your curiosity? You can keep the answer private.','A conversation across centuries','Imagine meeting someone from ancient Greece, medieval Europe or early America. Which assumption of your own would you most want to examine?'],
  ['Temperance','The bridge builder','Two vessels suggest exchange rather than perfect balance. Some ideas become richer when they meet without merging completely.','Which two interests might be worth putting in conversation?','An unlikely footnote','Place two unrelated subjects side by side—dream imagery and architecture, perhaps. What question appears between them?'],
  ['The Moon','The dreamer','A reflected moon changes with the water. An image may carry several meanings, or none you need to settle today.','If a dream image stays with you, sketch its mood rather than deciding what it must mean. Sharing is optional.','The map and the place','Sketch a remembered place without checking a map. What does the distortion reveal about attention, rather than geography?'],
  ['Strength','The companion','A gentle hand and a wild shape suggest relationship, not conquest. Contradictory feelings can be noticed without becoming instructions.','If comfortable: what quality is easier to admire in someone else than acknowledge in yourself? It is fine to skip this.','A different narrator','Retell a familiar scene from the viewpoint of a bystander. Which details become important when the narrator changes?']
 ];
 const palettes=[['#244639','#C7A45A','#E8DDC7'],['#25283D','#B85C38','#F3EEE4'],['#3E5149','#D6B777','#FCFAF6']];
 const labels={today:['Lantern on a quiet path','A compass above crossing paths','A star over a distant horizon'],career:['A bridge between two ridges','An ascending stair and a sun','An open doorway toward a horizon'],safoj:['Three circles around a shared center','An arch and its reflected shadow','Two vessels joined by a flowing line'],personal:['A garden beneath a rising sun','A bowl holding a small branch','A house beside a winding path'],writing:['Tree trunks framing a clearing','An open book and branching lines','A moon above an imagined woodland']};
 function dayKey(now=new Date()){const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
 function shift(key,n){return new Date(Date.parse(key+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
 function index(key){return ((Math.floor(Date.parse(key+'T12:00:00Z')/86400000)%reflections.length)+reflections.length)%reflections.length;}
 function selection(key){const i=index(key);return {index:i,reflection:reflections[i],variant:i%3};}
 function svgNode(tag,attrs={}){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
 function art(section,key){const {index:i,variant:v}=selection(key);const [bg,gold,paper]=palettes[v];const svg=svgNode('svg',{viewBox:'0 0 360 150',role:'img','aria-label':labels[section][v]+'. Original symbolic illustration.'});const title=svgNode('title');title.textContent=labels[section][v];svg.append(title);
  const add=(tag,attrs)=>svg.append(svgNode(tag,attrs));const line=d=>add('path',{d,fill:'none',stroke:paper,'stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'});const circle=(x,y,r,fill=gold)=>add('circle',{cx:x,cy:y,r,fill});
  add('rect',{width:360,height:150,rx:8,fill:bg});circle(305,30,45,'none');add('circle',{cx:305,cy:30,r:45,fill:'none',stroke:paper,'stroke-opacity':.15});
  for(let n=0;n<9;n++)circle(22+n*39,15+((n*29+i*11)%110),.9,paper);
  if(section==='today'){
   if(v===0){line('M35 145 Q135 75 165 130 T325 125 M175 98 L175 43 L203 43 L203 98 Z M179 43 Q189 16 199 43');circle(189,68,8);line('M189 56 L189 80 M177 68 L201 68');}
   if(v===1){line('M25 136 Q100 40 180 100 T340 120 M25 115 Q150 140 220 85 T340 65');add('path',{d:'M180 26 L186 48 L208 54 L186 60 L180 82 L174 60 L152 54 L174 48 Z',fill:gold});}
   if(v===2){line('M15 120 L103 72 L171 122 L246 84 L345 128 M25 135 L335 135');add('path',{d:'M180 22 L184 38 L201 42 L184 46 L180 62 L176 46 L159 42 L176 38 Z',fill:gold});}
  }
  if(section==='career'){
   if(v===0){line('M15 132 L80 96 L118 127 M242 127 L280 96 L345 132 M80 95 Q180 5 280 95 M80 95 L280 95');for(let x=100;x<280;x+=20)line(`M${x} 95 L${x} ${40+Math.abs(x-180)*.55}`);circle(180,35,12);}
   if(v===1){line('M35 128 L105 128 L105 105 L145 105 L145 82 L185 82 L185 59 L225 59 L225 36 L290 36');circle(290,64,18);line('M40 138 L315 138');}
   if(v===2){line('M135 132 L135 35 Q180 5 225 35 L225 132 M153 132 L153 46 Q180 27 207 46 L207 132 M35 132 L325 132 M166 131 L187 87 L204 131');circle(184,69,12);}
  }
  if(section==='safoj'){
   if(v===0){for(const [x,y] of [[156,63],[204,63],[180,101]])add('circle',{cx:x,cy:y,r:31,fill:'none',stroke:paper,'stroke-width':1.6});circle(180,76,7);}
   if(v===1){line('M125 92 L125 51 Q180 -5 235 51 L235 92 M90 96 L270 96 M125 104 Q180 159 235 104');circle(180,55,15);line('M139 112 Q180 143 221 112');}
   if(v===2){line('M77 57 L125 57 Q128 94 101 100 Q74 94 77 57 M227 84 L277 84 Q278 119 252 125 Q226 119 227 84 M103 60 C150 10 200 139 250 88');circle(180,48,13);}
  }
  if(section==='personal'){
   if(v===0){circle(245,53,23);line('M20 128 Q105 97 185 124 T340 121 M100 118 L100 53 M100 76 Q69 45 62 68 Q82 82 100 76 M100 96 Q138 62 143 85 Q124 105 100 96');}
   if(v===1){line('M115 97 Q180 174 245 97 Z M180 97 L180 37 M180 69 Q146 40 143 62 Q160 80 180 69 M180 51 Q209 20 213 43 Q197 61 180 51');circle(257,42,11);}
   if(v===2){line('M80 117 L80 71 L116 43 L152 71 L152 117 Z M106 117 L106 88 L128 88 L128 117 M128 142 Q216 126 201 86 T311 62');circle(260,40,17);}
  }
  if(section==='writing'){
   if(v===0){for(const x of [74,110,249,286])line(`M${x} 145 L${x} 26 M${x} 72 L${x-24} 49 M${x} 93 L${x+23} 61`);circle(180,66,22);line('M133 145 Q180 96 227 145');}
   if(v===1){line('M180 126 Q128 97 76 117 L76 51 Q129 32 180 60 Q232 32 284 51 L284 117 Q231 97 180 126 L180 60 M180 60 L180 18 M180 40 L158 23 M180 33 L205 16');circle(249,72,10);}
   if(v===2){circle(248,39,22);circle(258,31,22,bg);for(const x of [75,130,189])line(`M${x} 140 L${x} 46 M${x-25} 100 L${x} 59 L${x+25} 100 M${x-30} 124 L${x} 80 L${x+30} 124`);line('M20 140 Q230 102 340 140');}
  }
  return svg;
 }
 const api={dayKey,shift,index,selection,art,reflections};if(typeof module==='object'&&module.exports)module.exports=api;else root.DailySpark=api;
})(typeof globalThis==='object'?globalThis:this);
