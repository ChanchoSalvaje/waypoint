"""Local UI build only. No network, credentials, deployment or writes outside this checkout/preview."""
from pathlib import Path
import json,base64,argparse
P=Path(__file__).parent; public=P.parent/'public/spore'
a=public.joinpath('app.js').read_text()
start=a.index('/* BEGIN SPORE PRESENTATION */') if '/* BEGIN SPORE PRESENTATION */' in a else a.index("(function(root){\n  'use strict';\n  function safeURL")
end=a.index('let busy=false,latestBrief=null',start)
sdk=a[:start]
bridge=(P/'connected.js').read_text()
bridge=bridge.replace('return {version:2,revision:0', 'return {owner:s.owner,version:2,revision:0')
if 's=SporeVisibility.snapshot(s);' not in bridge:
 bridge=bridge.replace('function convertSnapshot(s){','function convertSnapshot(s){\n s=SporeVisibility.snapshot(s);')
old=json.loads((P/'assets/existing.json').read_text())
catalog={k:dict(old['sections'][v]) for k,v in [('atkins','personal'),('durer','career'),('blake','safoj')]}
extras={437980:('cypresses','Dark green cypresses rise into a swirling turquoise sky, above a yellow-green field.'),437881:('pitcher','A woman holds a silver pitcher beside an open window in a softly lit room.'),39799:('wave','A curling blue wave towers over three boats, with Mount Fuji small in the distance.'),10497:('oxbow','A winding river crosses sunlit farmland beneath storm clouds, viewed from a wooded hillside.')}
for id,(key,alt) in extras.items():
 m=json.loads((P/f'assets/{id}.json').read_text());assert m['isPublicDomain']
 catalog[key]={'data':'data:image/jpeg;base64,'+base64.b64encode((P/f'assets/{id}.jpg').read_bytes()).decode(),'alt':alt,'credit':m['artistDisplayName']+' · '+('The Great Wave' if key=='wave' else 'The Oxbow' if key=='oxbow' else m['title'])+', '+m['objectDate']+' · Public domain','source':m['objectURL']}
cat='const ArtCatalog='+json.dumps(catalog,ensure_ascii=False)+';\n'
parts=[(P/n).read_text() for n in ['brief-renderer.js','model.js','spark.js']]+[cat]+[(P/n).read_text() for n in ['art-cycle.js','view.js']]+['/* BEGIN SPORE ACTION PRESENTATION */']+[(P/n).read_text() for n in ['visibility.js','content-policy.js','commitments.js','action-view.js','freshness.js','cards.js']]
presentation='/* BEGIN SPORE PRESENTATION */\n'+'\n'.join(parts)+'\n/* END SPORE PRESENTATION */\n'
public.joinpath('index.html').write_text((P/'shell.html').read_text())
public.joinpath('app.js').write_text(sdk+presentation+bridge)
public.joinpath('app.css').write_text((P/'cards.css').read_text())
# Existing auth shell stays byte-identical; all demo affordances are confined to the separate preview.
args=argparse.ArgumentParser();args.add_argument('--preview-dir');opts=args.parse_args()
if opts.preview_dir:
 out=Path(opts.preview_dir);out.mkdir(parents=True,exist_ok=True)
 h=(P/'shell.html').read_text().replace('<body>','<body><div class="preview-banner">LOCAL DESIGN PREVIEW · Synthetic examples only · No account connected</div>')
 h=h.replace('<script src="./app.js" defer></script>','<script src="./preview.js" defer></script>')
 h=h.replace('Private workspace · shared saves','Local preview · synthetic examples').replace('Tasks and notes save to your private Supabase workspace after sign-in. Earlier browser-only demo data remains on this browser and is not imported.','This separate preview uses synthetic records in memory. Nothing is sent to Supabase or Airtable. Reload resets examples.').replace('Daily briefs are saved to your private workspace before the chat summary. Live calendar feeds are not connected. Clearly labeled synthetic acceptance records may also appear.','Review artwork, readable notes, and upcoming commitments. All examples are fictional.')
 h=h.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">')
 (out/'index.html').write_text(h)
 (out/'app.css').write_text(public.joinpath('app.css').read_text()+'\n.preview-banner{padding:.7rem 1rem;background:#25283D;color:#FCFAF6;font:600 .75rem/1.6 system-ui;text-align:center}.preview-tools{padding:1rem;border-bottom:1px solid #E3DCCF;display:flex;gap:.6rem;flex-wrap:wrap}.preview-tools button{font:inherit;padding:.5rem}.preview-tools output{white-space:pre-wrap;flex-basis:100%;overflow-wrap:anywhere}')
 (out/'preview.js').write_text((P/'preview-sdk.js').read_text()+presentation+bridge+'\n'+(P/'preview-checks.js').read_text())
 print('Built local preview:',out)
print('Built action presentation; auth SDK preserved; bridge retains verified owner.')
