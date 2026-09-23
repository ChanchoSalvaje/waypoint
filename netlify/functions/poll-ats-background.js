// poll-ats.js — Waypoint ATS Watchlist Poller (Netlify Scheduled Function)
// Runs daily at 12:00 PM Tucson (19:00 UTC — AZ has no DST). Reads the Watchlist
// table, probes public Greenhouse/Lever/Ashby job-board endpoints, filters titles
// against the AI-enablement lane vocabulary, dedupes against Opportunities, and
// writes keepers as Saved rows. Deterministic fetch/filter lives HERE (code);
// judgment (Fit scoring, dossiers, decisions) stays with Claude + Tim.
//
// Design notes:
// - Reads the Settings table (Slice 4) if it exists; falls back to the defaults
//   below and says so in the log. Never invents values, never silently skips.
// - Keep-and-flag philosophy: title match = keeper. Location/level/comp concerns
//   are FLAGS in the Fit Read, not silent drops. The only drops: clearance terms
//   and parseable comp below the gate.
// - Fit Score is intentionally left empty — scoring is judgment, not code.
//   Keepers carry "NEEDS FIT READ" so the next mine/Council pass scores them.
// - Poll Notes are append-only and only written when something CHANGED.

const BASE_ID = 'appUQQ4gnT7UuFOOm';
const WATCHLIST_TABLE = 'tblzwXPsedzGgLH9D';
const OPPS_TABLE = 'tblWZyC4j4z12roVq';
const SETTINGS_TABLE_NAME = 'Settings'; // by name — table may not exist yet

// --- Watchlist field IDs ---
const W = {
  company: 'fldHoU12GtcHdwyVU',
  tier: 'fldtTHCAfrX4aIHYt',
  atsType: 'fldN9VzuwcCv7JXUU',
  atsSlug: 'fldlkbkSHhie7hYh4',
  careersUrl: 'fldbckVHamSlNM1UE',
  status: 'fldH0nDiUWii8VDyb',
  lastPolled: 'fldf4dgLbSwL1PNuA',
  pollNotes: 'fldr8E8XZFeASBFyE',
};

// --- Opportunities field IDs ---
const O = {
  company: 'flduaK4UtRwoU9WLu',
  role: 'fldAGmW3YgUsHNbWe',
  // Track (fldLKcLhqLycu8n2H) retired 2026-09-23 (Standard v1.16 / Profile v8.27). Never written.
  stage: 'fldE1YGHZdjiPIkiR',
  comp: 'fld4neoTZvK52G9l4',
  link: 'fldpNcqFRnN7zMzzO',
  source: 'fldVtN8Rdj3b1yDML',
  fitRead: 'fldQEgL4DABbkFEK5',
  dateFound: 'fldsfSFJUdiVr4VFZ',
  notes: 'fldXN9uz1ZcIFtsKm',
};

// --- Defaults (used when the Settings table is absent/unreadable) ---
// Mirrors SCORING.md v1.1 + SLICE4 spec §5.3 AI-Enablement lane (locked 7/11).
const DEFAULTS = {
  compGate: 155000,
  compTarget: 195000,
  vocab: [
    /\bAI enablement\b/i, /\bAI adoption\b/i, /\bAI transformation\b/i,
    /\bAI strategy\b/i, /\bAI governance\b/i,
    /\b(Gen ?AI|generative AI)\b.*\b(program|strategy|enablement)\b/i,
    /\b(program|strategy|enablement)\b.*\b(Gen ?AI|generative AI)\b/i,
    /\bAI (Center of Excellence|CoE)\b/i, /\bHead of AI\b/i,
    /\b(Director|Sr\.? Director|Senior Director|VP|Vice President)\b.*\bAI\b/i,
    /\bAI\b.*\b(Director|Sr\.? Director|Senior Director|VP|Vice President)\b/i,
    /\b(Principal|Staff|Group|Senior|Sr\.?|Lead)\b.*\bAI\b.*\bProduct\b/i,
    /\bAI Product (Manager|Lead|Director|Management)\b/i,
    /\bapplied AI\b/i, /\bAI champions?\b/i,
    /\bAI (operations|program|programs)\b/i,
    // Commercial-PM door, senior forms only (v1.2):
    /\bPrincipal Product Manager\b/i, /\bGroup Product Manager\b/i,
    /\bDirector,? (of )?Product( Management)?\b/i,
  ],
  clearanceDrop: /\b(clearance|TS\/SCI|top secret|secret clearance)\b/i,
  maxKeepersPerRun: 15,
  perCompanyCap: 3, // at most N keepers per company per run — so one big board can't hog the run (approved 2026-07-12)
};

const AT = 'https://api.airtable.com/v0';
const token = () => process.env.AIRTABLE_TOKEN; // ← match the env var name your existing functions use
const hdrs = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });
const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- Airtable helpers ----------
async function atList(table, params = '') {
  let records = [], offset;
  do {
    const url = `${AT}/${BASE_ID}/${table}?returnFieldsByFieldId=true&pageSize=100${params}${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: hdrs() });
    if (!res.ok) throw new Error(`Airtable list ${table}: ${res.status} ${await res.text()}`);
    const data = await res.json();
    records = records.concat(data.records);
    offset = data.offset;
    await sleep(220); // stay under Airtable's 5 rps
  } while (offset);
  return records;
}

async function atWrite(method, table, records) {
  for (let i = 0; i < records.length; i += 10) {
    const res = await fetch(`${AT}/${BASE_ID}/${table}`, {
      method,
      headers: hdrs(),
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable ${method} ${table}: ${res.status} ${await res.text()}`);
    await sleep(220);
  }
}

// ---------- Settings (Slice 4) ----------
async function loadSettings(log) {
  try {
    const res = await fetch(`${AT}/${BASE_ID}/${encodeURIComponent(SETTINGS_TABLE_NAME)}?maxRecords=1`, { headers: hdrs() });
    if (!res.ok) throw new Error(String(res.status));
    const rec = (await res.json()).records?.[0];
    if (!rec) throw new Error('empty');
    const f = rec.fields;
    const s = { ...DEFAULTS };
    if (f['Comp Gate ($)']) s.compGate = Number(f['Comp Gate ($)']);
    if (f['Comp Target ($)']) s.compTarget = Number(f['Comp Target ($)']);
    // Lane vocab from Settings arrives as newline/·-separated plain terms; compile loosely.
    if (f['Vocab: AI Enablement']) {
      const terms = String(f['Vocab: AI Enablement']).split(/[\n·]+/).map(t => t.trim()).filter(t => t.length > 2 && !t.startsWith('('));
      if (terms.length > 3) s.vocab = terms.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    log.push(`Settings: loaded from table (gate $${s.compGate}, target $${s.compTarget}).`);
    return s;
  } catch {
    log.push(`Settings: table not found/readable — using SCORING.md v1.1 defaults (gate $${DEFAULTS.compGate}). Not an error until Slice 4 lands.`);
    return { ...DEFAULTS };
  }
}

// ---------- ATS probes ----------
async function tryJson(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'waypoint-poller/1.0 (personal job search)' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function slugCandidates(name) {
  const flat = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return [...new Set([flat.replace(/ /g, ''), flat.replace(/ /g, '-'), flat.split(' ')[0]])];
}

// Normalize each ATS's payload to [{title, location, url, comp}]
async function fetchBoard(atsType, slug) {
  if (atsType === 'Greenhouse') {
    const d = await tryJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    return d?.jobs?.map(j => ({ title: j.title, location: j.location?.name || '', url: j.absolute_url, comp: null })) ?? null;
  }
  if (atsType === 'Lever') {
    const d = await tryJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return Array.isArray(d) ? d.map(j => ({
      title: j.text, location: j.categories?.location || (j.workplaceType === 'remote' ? 'Remote' : ''),
      url: j.hostedUrl,
      comp: j.salaryRange ? { min: j.salaryRange.min, max: j.salaryRange.max } : null,
    })) : null;
  }
  if (atsType === 'Ashby') {
    const d = await tryJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
    return d?.jobs?.map(j => ({
      title: j.title, location: j.isRemote ? `Remote — ${j.location || ''}` : (j.location || ''),
      url: j.jobUrl || j.applyUrl,
      comp: j.compensation?.compensationTierSummary ? { summary: j.compensation.compensationTierSummary } : null,
    })) ?? null;
  }
  return null;
}

async function resolveSlug(companyName, log) {
  for (const slug of slugCandidates(companyName)) {
    for (const ats of ['Greenhouse', 'Lever', 'Ashby']) {
      const jobs = await fetchBoard(ats, slug);
      if (jobs) { log.push(`${companyName}: resolved → ${ats}/${slug} (${jobs.length} postings)`); return { ats, slug, jobs }; }
      await sleep(150);
    }
  }
  return null;
}

// ---------- Filters ----------
function evaluate(job, settings) {
  if (!settings.vocab.some(rx => rx.test(job.title))) return { keep: false };
  if (settings.clearanceDrop.test(`${job.title} ${job.location}`)) return { keep: false, reason: 'clearance' };

  const flags = [];
  const loc = (job.location || '').toLowerCase();
  const remoteOk = /remote|anywhere|united states|usa|tucson/.test(loc);
  if (!remoteOk && loc) flags.push(`location "${job.location}" — verify Remote-US/Tucson eligibility`);
  if (!loc) flags.push('location not stated — verify');

  let compNote = '';
  if (job.comp?.max != null) {
    if (job.comp.max < settings.compGate) return { keep: false, reason: `comp max $${job.comp.max} < gate` };
    compNote = `$${(job.comp.min/1000|0)}K–$${(job.comp.max/1000|0)}K`;
    if (job.comp.max < settings.compTarget) flags.push('below $' + settings.compTarget/1000 + 'K target — negotiable, per keep-and-flag');
  } else if (job.comp?.summary) {
    compNote = job.comp.summary;
  } else {
    flags.push('comp unposted — confirm ≥ gate at source');
  }
  if (!/(director|vp|vice president|head of|principal|staff|group)/i.test(job.title)) {
    flags.push('below Director-equivalent title — may be negotiable');
  }
  return { keep: true, flags, compNote };
}

// ---------- Main run ----------
async function runPoll() {
  const log = [];
  const settings = await loadSettings(log);
  const watchRows = (await atList(WATCHLIST_TABLE)).filter(r => r.fields[W.status] === 'Active');
  log.push(`Watchlist: ${watchRows.length} Active companies.`);

  // Dedupe index from Opportunities (company+role, normalized)
  const opps = await atList(OPPS_TABLE, `&fields%5B%5D=${O.company}&fields%5B%5D=${O.role}`);
  const seen = new Set(opps.map(r => norm(r.fields[O.company]) + '|' + norm(r.fields[O.role])));

  const keepers = [], watchUpdates = [];
  let scanned = 0, probeFails = 0, dupes = 0;

  for (const row of watchRows) {
    const name = row.fields[W.company];
    const upd = { id: row.id, fields: { [W.lastPolled]: today() } };
    let noteAdd = '';
    try {
      let ats = row.fields[W.atsType], slug = row.fields[W.atsSlug], jobs = null;

      if (ats === 'Workday') { noteAdd = ''; } // honest skip — no public endpoint
      else if (slug && ats && ats !== 'Unknown — probe') {
        jobs = await fetchBoard(ats, slug);
        if (!jobs) { upd.fields[W.status] = 'Probe failed — needs slug'; probeFails++; noteAdd = `${today()}: known slug ${ats}/${slug} stopped responding — needs re-probe.`; }
      } else {
        const hit = await resolveSlug(name, log);
        if (hit) {
          ({ ats, slug } = { ats: hit.ats, slug: hit.slug }); jobs = hit.jobs;
          upd.fields[W.atsType] = ats; upd.fields[W.atsSlug] = slug;
          noteAdd = `${today()}: slug auto-resolved → ${ats}/${slug}.`;
        } else {
          upd.fields[W.status] = 'Probe failed — needs slug'; probeFails++;
          noteAdd = `${today()}: probe failed on all candidates (GH/Lever/Ashby) — likely Workday/proprietary. Alerts + signals cover this company.`;
        }
      }

      if (jobs) {
        scanned += jobs.length;
        let companyKept = 0;
        for (const job of jobs) {
          const v = evaluate(job, settings);
          if (!v.keep) continue;
          const key = norm(name) + '|' + norm(job.title);
          if (seen.has(key)) { dupes++; continue; }
          if (keepers.length >= settings.maxKeepersPerRun) { log.push('Keeper cap reached — spillover next run.'); break; }
          if (companyKept >= settings.perCompanyCap) { log.push(`${name}: per-company cap (${settings.perCompanyCap}) reached — remaining titles spill to next run.`); break; }
          companyKept++;
          seen.add(key);
          keepers.push({ fields: {
            [O.company]: name,
            [O.role]: job.title,
            [O.stage]: 'Saved',
            [O.source]: 'Company site',
            [O.link]: job.url || '',
            [O.comp]: v.compNote || '',
            [O.dateFound]: new Date().toISOString(),
            [O.fitRead]: `AUTO-KEEPER (ATS poll) — NEEDS FIT READ on next mine/Council pass. Flags: ${v.flags.length ? v.flags.join('; ') : 'none'}.`,
            [O.notes]: `${today()}: Found via ATS direct poll of ${name}'s ${ats} board — posting live as of today. SPEED ADVANTAGE: fresh window; if scored Fit 4–5, Speed Rule 48-hr clock applies from Pursue.`,
          }});
          noteAdd += ` ${today()}: keeper written — "${job.title}".`;
        }
      }
    } catch (e) {
      log.push(`${name}: ERROR ${e.message}`); probeFails++;
      noteAdd = `${today()}: poll error — ${e.message}`.slice(0, 300);
    }
    if (noteAdd) upd.fields[W.pollNotes] = ((row.fields[W.pollNotes] || '') + '\n' + noteAdd).trim(); // append-only
    watchUpdates.push(upd);
    await sleep(250); // polite, sequential
  }

  if (keepers.length) await atWrite('POST', OPPS_TABLE, keepers);
  await atWrite('PATCH', WATCHLIST_TABLE, watchUpdates);

  const summary = `ATS poll ${today()}: ${watchRows.length} polled · ${scanned} postings scanned · ${keepers.length} keepers written · ${dupes} dupes skipped · ${probeFails} probe failures.`;
  console.log(summary); log.forEach(l => console.log('  ' + l));
  return { summary, keepers: keepers.map(k => `${k.fields[O.company]} — ${k.fields[O.role]}`), log };
}

// Netlify scheduled function export (cron lives in netlify.toml)
exports.handler = async () => {
  const result = await runPoll();
  return { statusCode: 200, body: JSON.stringify(result) };
};
exports.runPoll = runPoll; // shared with poll-ats-now.js
