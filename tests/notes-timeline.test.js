/* ============================================================
   Tests for public/notes-timeline.js
   Run:  node tests/notes-timeline.test.js
   No dependencies, no network, no Airtable calls.

   The fixtures in tests/fixtures/notes-samples.json are 15 Notes
   values chosen to cover every stored format found in the base,
   then ANONYMIZED (2026-09-22): every word outside a small list of
   generic ones is swapped for a same-length placeholder with the
   same letter-by-letter casing, other digits are randomized, and
   record ids are replaced. Date markers, " | " joins, newlines,
   punctuation, labels and caps runs are untouched, and the parser
   was checked to produce the identical structure (entries, dates,
   times, labels, mono and caps spans) on the anonymized text.
   Do not paste real Notes values back into this file.

   The headline test is CONTENT PRESERVATION: for every sample, the
   rendered HTML must still contain every non-whitespace character
   of the stored text. That is the guarantee that this display-only
   change can never hide or drop part of the log.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const T = require("../public/notes-timeline.js");

const SAMPLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "notes-samples.json"), "utf8")
);

let passed = 0, failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push({ name, detail }); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected,
     `expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(actual)}`);
}

/* ---- helpers ---------------------------------------------------------- */

// Strip HTML tags and unescape, so we can compare rendered output to source.
function textOf(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

// Compare ignoring whitespace and the " | " delimiters (a delimiter is
// structure, not content). Everything else must survive verbatim.
function signature(s) {
  return s.replace(/[|…]/g, "").replace(/\s+/g, "");
}

// The SAME date-marker shapes the parser splits on. Used to strip the marker
// off an entry's raw text so the comparison below ignores the one thing the
// renderer legitimately rewrites: "[2026-09-01]:" is shown as "Sep 1, 2026".
const MARKER_HEAD =
  /^(?:\[\d{4}-\d{2}-\d{2}[^\]]{0,24}\]\s*:?|\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2}(?:\s*[A-Z]{2,4})?)?(?:\s*\(approx\))?\s*:|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*:)\s*/;

// Case-insensitive, because labels are re-cased for display ("SENT" -> "Sent").
// That is the only other intentional transformation.
function contentSig(s) { return signature(s).toLowerCase(); }

// Everything the parser kept for one entry, reassembled.
// The ":" is added back after each label because that colon is a delimiter the
// renderer consumes when it turns "SENT:" into an eyebrow — the same way " | "
// is consumed between entries. Adding it back keeps the comparison exact
// everywhere else, so a genuinely dropped colon would still fail the test.
// withColons:true  -> models the SOURCE text, for comparing against entry.raw
// withColons:false -> models the RENDERED text, where a label is an eyebrow
function reassemble(e, withColons) {
  if (!e.ok) return contentSig(e.raw);
  const c = withColons === false ? "" : ":";
  return contentSig(
    (e.leadLabel ? e.leadLabel + c : "") + e.headline +
    e.sections.map(s => (s.label ? s.label + c : "") + (s.text || "")).join("")
  );
}

/* ============================================================
   1. CONTENT PRESERVATION — the guarantee that matters most
   ============================================================ */
console.log("\n— Content preservation (15 anonymized samples) —");
for (const s of SAMPLES) {
  const entries = T.parseNotes(s.notes);

  // 1a. Every character of the source lands in some entry's raw.
  const joinedRaw = entries.map(e => e.raw).join("");
  ok(`parse keeps every character — ${s.company}`,
     signature(joinedRaw) === signature(s.notes),
     `sig lengths: raw=${signature(joinedRaw).length} src=${signature(s.notes).length}`);

  // 1b. STRICT, per entry: what the parser kept must equal the entry's own
  //     text with only its date marker removed. Exact string equality — this
  //     catches a single dropped word, which a length comparison would not.
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expected = contentSig(e.raw.replace(MARKER_HEAD, ""));
    const actual = reassemble(e);
    ok(`entry ${i} loses nothing — ${s.company}`, actual === expected,
       `expected ${expected.length} chars, got ${actual.length}\n` +
       `       exp: ${expected.slice(0, 120)}\n       got: ${actual.slice(0, 120)}`);
  }

  // 1c. Everything the parser kept actually reaches the DOM.
  const rendered = contentSig(textOf(T.renderTimeline(s.notes)));
  for (let i = 0; i < entries.length; i++) {
    ok(`entry ${i} reaches the DOM — ${s.company}`,
       rendered.includes(reassemble(entries[i], false)),
       `entry ${i} body not found in rendered output`);
  }
}

/* ============================================================
   2. NO STORED TEXT IS MUTATED — body case is left alone
   ============================================================ */
console.log("— Body text is never re-cased —");
{
  const src = "[2026-08-30] APPLIED via Workday (R40417).\n" +
              "SENT: NEW MATERIAL CAPTURED HERE FOR THE FIRST TIME, all of it Tim's.";
  const html = T.renderTimeline(src);
  const txt = textOf(html);
  ok("all-caps body sentence keeps its characters",
     txt.includes("NEW MATERIAL CAPTURED HERE FOR THE FIRST TIME"),
     txt.slice(0, 200));
  ok("all-caps body sentence is styled, not rewritten",
     html.includes('class="tl-shout"'), "no tl-shout span emitted");
  ok("headline keeps stored 'APPLIED' casing",
     txt.includes("APPLIED via Workday"), txt.slice(0, 120));
}

/* ============================================================
   3. LABEL DETECTION + RE-CASING (display only)
   ============================================================ */
console.log("— Labels —");
eq("SENT -> Sent", T._sentenceCaseLabel("SENT"), "Sent");
eq("CONFIDENTIALITY CHECK -> Confidentiality check",
   T._sentenceCaseLabel("CONFIDENTIALITY CHECK"), "Confidentiality check");
eq("STABILITY FLAG -> Stability flag",
   T._sentenceCaseLabel("STABILITY FLAG"), "Stability flag");
eq("BUILD/BUY STORY -> Build/buy story",
   T._sentenceCaseLabel("BUILD/BUY STORY"), "Build/buy story");
eq("JD stays an acronym", T._sentenceCaseLabel("JD"), "JD");
eq("JD PROVENANCE keeps the acronym",
   T._sentenceCaseLabel("JD PROVENANCE"), "JD provenance");
eq("label with a date keeps the date",
   T._sentenceCaseLabel("INCIDENT 2026-09-16"), "Incident 2026-09-16");

{
  // The false-positive guard: a long caps RUN broken by a comma is a
  // sentence, not a label, even though a colon appears later in the line.
  const e = T.parseNotes(
    "[2026-08-30] Did a thing.\nNEW MATERIAL CAPTURED HERE FOR THE FIRST TIME, " +
    "all of it Tim's, none previously in any document: (1) PRODUCT OWNER of a platform."
  )[0];
  const labels = e.sections.filter(s => s.label).map(s => s.label);
  ok("broken caps run is NOT treated as a label", labels.length === 0,
     "got labels: " + JSON.stringify(labels));

  // Mid-sentence caps used for emphasis (no colon) are never labels.
  const e2 = T.parseNotes("[2026-08-30] Internal name is ZED — NOT used on outgoing docs.")[0];
  ok("mid-sentence emphasis caps are not labels",
     e2.sections.every(s => !s.label), JSON.stringify(e2.sections));
}

/* ============================================================
   3b. HEADLINES — no duplication, no truncation, leading label
       promoted beside the date rather than printed under it.
   ============================================================ */
console.log("— Headlines —");
{
  // Entry opens on a label. The label introduces the sentence, so it must
  // appear BEFORE it (next to the date), not underneath it.
  const e = T.parseNotes(
    "[2026-09-13] COUNCIL READ: pursue, Track B (AI-led, PMO as credibility base). " +
    "Strengths — portfolio prioritization and value-realization tracking."
  )[0];
  eq("leading label is promoted", e.leadLabel, "Council read");
  eq("headline is the sentence the label introduces",
     e.headline, "pursue, Track B (AI-led, PMO as credibility base).");
  ok("promoted label is not repeated in the body",
     e.sections.every(s => s.label !== "Council read"),
     JSON.stringify(e.sections.map(s => s.label)));

  const html = T.renderTimeline(
    "[2026-09-13] COUNCIL READ: pursue, Track B (AI-led, PMO as credibility base). Strengths follow."
  );
  eq("label rendered exactly once",
     (html.match(/Council read/g) || []).length, 1);
  ok("label sits in the meta row", html.includes('class="tl-lead-lbl">Council read'), html);
}
{
  // A long first sentence is shown in full and must NOT also appear in the body.
  const long = "[2026-09-15]: APPLY LINK WRITTEN from Tim-supplied browser URL " +
    "(https://jobs.example.com/us/en/job/10000001/Sample-Role-Title-Senior); " +
    "live per Tim's in-browser read 2026-09-15. Human-verify-only ATS.";
  const e = T.parseNotes(long)[0];
  ok("long headline is not truncated", !e.headline.endsWith("…"), e.headline);
  const bodyText = e.sections.map(s => s.text).join(" ");
  ok("headline sentence is not repeated in the body",
     !bodyText.includes("APPLY LINK WRITTEN from Tim-supplied"), bodyText.slice(0, 160));
  const html = T.renderTimeline(long);
  eq("sentence appears exactly once in the render",
     (textOf(html).match(/APPLY LINK WRITTEN from Tim-supplied/g) || []).length, 1);
}
{
  // The all-caps softener must not cut a word in half.
  const html = T.renderTimeline(
    "[2026-09-15, later]: BUILD/BUY/ADAPT STORY CAPTURED (Tim-stated, this session). Details follow."
  );
  ok("shout span does not split 'Tim-stated'",
     !/tl-shout">[^<]*\(T<\/span>/.test(html) && !html.includes(">im-stated"),
     html.slice(0, 400));
  ok("the caps run is still softened", html.includes('class="tl-shout"'), html.slice(0, 400));
}

/* ============================================================
   4. ENTRY SPLITTING
   ============================================================ */
console.log("— Entry splitting —");
{
  const e = T.parseNotes("[2026-08-30] One. | [2026-08-31]: Two.");
  eq("' | ' before a date splits", e.length, 2);
  eq("  first date",  e[0].date, "Aug 30, 2026");
  eq("  second date", e[1].date, "Aug 31, 2026");
}
{
  const e = T.parseNotes("[2026-08-30] Row is Applied (2026-08-30); stage unchanged.");
  eq("an inline date does NOT split", e.length, 1);
}
{
  const e = T.parseNotes("Source: Indeed alert (6/22). | 6/25: Verified lane. | 6/25: Closed.");
  eq("undated preamble + 2 short-date entries", e.length, 3);
  eq("  preamble has no date chip", e[0].date, null);
  eq("  short date rendered literally", e[1].date, "6/25");
  eq("  year is never inferred", e[1].dateIso, null);
}
{
  const e = T.parseNotes("2026-09-04 11:39 MST: Applied on Thursday.");
  eq("note-box stamp parses", e.length, 1);
  eq("  date", e[0].date, "Sep 4, 2026");
  eq("  time kept", e[0].time, "11:39 MST");
}
{
  const e = T.parseNotes("[2026-07-23 16:12 MST]: v0 draft filed.");
  eq("bracketed date with time", e[0].date, "Jul 23, 2026");
  eq("  time kept", e[0].time, "16:12 MST");
}
{
  const e = T.parseNotes("[2026-09-15, later]: Story captured.");
  eq("bracket qualifier kept", e[0].dateQual, "later");
  eq("  date still parsed", e[0].date, "Sep 15, 2026");
}
{
  const e = T.parseNotes("A pipe | that precedes no date must not split.");
  eq("' | ' without a date does not split", e.length, 1);
  ok("  the pipe stays in the body", e[0].raw.includes("|"), e[0].raw);
}

/* ============================================================
   5. DATE DISPLAY
   ============================================================ */
console.log("— Dates —");
eq("Aug 30", T._displayIso("2026-08-30"), "Aug 30, 2026");
eq("Jan 1 (no zero padding)", T._displayIso("2026-01-01"), "Jan 1, 2026");
eq("Dec 31", T._displayIso("2025-12-31"), "Dec 31, 2025");

/* ============================================================
   6. FALLBACK + ORDERING
   ============================================================ */
console.log("— Fallback & ordering —");
{
  const e = T.parseNotes("LinkedIn job-alert digest (director in Sample City) 2026-09-18; jobid 4000000001");
  eq("undated single line is one entry", e.length, 1);
  eq("  no date chip", e[0].date, null);
  const txt = textOf(T.renderTimeline(
    "LinkedIn job-alert digest (director in Sample City) 2026-09-18; jobid 4000000001"));
  ok("  content still rendered in full",
     txt.includes("jobid 4000000001"), txt);
}
{
  // Stored order is already oldest-first (every writer appends), and the
  // parser must preserve it rather than re-sorting.
  const e = T.parseNotes("[2026-08-30] A. | [2026-08-31]: B. | [2026-09-01]: C.");
  eq("oldest first", e[0].dateIso, "2026-08-30");
  eq("newest last", e[2].dateIso, "2026-09-01");
}
{
  eq("empty notes -> no entries", T.parseNotes("").length, 0);
  eq("null notes -> no entries", T.parseNotes(null).length, 0);
  ok("empty notes render an empty state",
     T.renderTimeline("").includes("No notes yet"), T.renderTimeline(""));
}

/* ============================================================
   7. MONOSPACE SPOTTING
   ============================================================ */
console.log("— Monospace —");
{
  const html = T.renderTimeline("[2026-08-30] Sent TMasters_Resume_SampleCo_OPS.docx for R40417.");
  ok("filename is monospaced",
     /<span class="tl-mono">TMasters_Resume_SampleCo_OPS\.docx<\/span>/.test(html), html);
  ok("requisition id is monospaced",
     /<span class="tl-mono">R40417<\/span>/.test(html), html);
  const html2 = T.renderTimeline("[2026-09-13] Predicted by row recA1b2C3d4E5f6G7 earlier.");
  ok("record id is monospaced",
     /<span class="tl-mono">recA1b2C3d4E5f6G7<\/span>/.test(html2), html2);
}

/* ============================================================
   8. ACCESSIBILITY / CONTROLS
   ============================================================ */
console.log("— Controls —");
{
  const many = Array.from({ length: 8 }, (_, i) =>
    `[2026-09-0${i + 1}]: Entry number ${i + 1} with enough text to matter here.`).join(" | ");
  const html = T.renderTimeline(many);
  ok("more than 5 entries -> 'Show N earlier entries'",
     html.includes("Show 3 earlier entries"), html.slice(0, 300));
  ok("earlier group is hidden by default",
     html.includes('tl-list--earlier is-hidden'), "");
  ok("toggles are real <button> elements",
     /<button type="button" class="tl-earlier"/.test(html), "");
  ok("toggles carry aria-expanded", html.includes('aria-expanded="false"'), "");
  ok("toggles carry aria-controls", html.includes('aria-controls="tl-earlier-group"'), "");

  const few = T.renderTimeline("[2026-09-01]: One. | [2026-09-02]: Two.");
  ok("5 or fewer entries -> no 'earlier' control",
     !few.includes("tl-earlier"), few.slice(0, 200));
}
{
  const html = T.renderTimeline(
    "[2026-09-01]: Short one. | [2026-09-02]: The newest entry here.");
  const lastExpanded = html.lastIndexOf('aria-expanded="true"');
  ok("newest entry is expanded by default", lastExpanded !== -1 || !html.includes("tl-more"),
     "no expanded entry found");
}

/* ============================================================
   8b. RENDER OPTIONS — the compact board-row variant
       (oppNotes passes {collapseAfter:3, expandNewest:false})
   ============================================================ */
console.log("— Render options —");
{
  // Two sentences each, so every entry has a body and therefore a toggle.
  const many = Array.from({ length: 11 }, (_, i) =>
    `[2026-09-${String(i + 1).padStart(2, "0")}]: Entry ${i + 1} headline here. ` +
    `And a second sentence forming the body of entry ${i + 1}.`
  ).join(" | ");

  const compact = T.renderTimeline(many, { collapseAfter: 3, expandNewest: false });
  ok("collapseAfter:3 hides the rest", compact.includes("Show 8 earlier entries"),
     compact.slice(0, 200));
  ok("expandNewest:false leaves every entry collapsed",
     !compact.includes('aria-expanded="true"'), "found an expanded entry");
  ok("no 'Show less' on first paint", !compact.includes("Show less"), "");

  const full = T.renderTimeline(many);
  ok("defaults are unchanged for the detail view",
     full.includes("Show 6 earlier entries"), full.slice(0, 200));
  ok("default still expands the newest", full.includes('aria-expanded="true"'), "");

  // The compact variant must not drop anything either — including the 8
  // entries behind the toggle, which are in the DOM, just hidden.
  const compactText = contentSig(textOf(compact));
  const parsed = T.parseNotes(many);
  let allPresent = true, firstMissing = "";
  for (const e of parsed) {
    if (!compactText.includes(reassemble(e, false))) {
      allPresent = false; firstMissing = e.headline; break;
    }
  }
  ok("compact render keeps every entry, including collapsed ones",
     allPresent, `missing: ${firstMissing}`);
  eq("all 11 entries are in the DOM",
     (compact.match(/class="tl-entry/g) || []).length, 11);
}
{
  const html = T.renderTimeline("", { emptyHtml: '<p class="opp-empty">No history logged yet.</p>' });
  ok("emptyHtml override is used", html.includes("No history logged yet."), html);
}

/* ============================================================
   9. HTML SAFETY
   ============================================================ */
console.log("— Escaping —");
{
  const html = T.renderTimeline("[2026-09-01]: <script>alert(1)</script> & \"quoted\".");
  ok("angle brackets escaped", !html.includes("<script>"), html);
  ok("ampersand escaped", html.includes("&amp;"), html);
}

/* ============================================================
   CORPUS SWEEP (optional) — runs over every Notes value in the
   base when a corpus file is present. Generated read-only; not
   committed. Path via WP_CORPUS env var.
   ============================================================ */
const corpusPath = process.env.WP_CORPUS;
let corpusStats = null;
if (corpusPath && fs.existsSync(corpusPath)) {
  const recs = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const NOTES = "fldXN9uz1ZcIFtsKm", CO = "flduaK4UtRwoU9WLu";
  corpusStats = {
    records: 0, entries: 0, clean: 0, fallback: 0,
    lossy: [], fallbackExamples: [], outOfOrder: []
  };
  for (const r of recs) {
    const notes = (r.fields || {})[NOTES] || "";
    if (!notes.trim()) continue;
    corpusStats.records++;
    const entries = T.parseNotes(notes);
    corpusStats.entries += entries.length;
    for (const e of entries) {
      if (e.ok) corpusStats.clean++; else {
        corpusStats.fallback++;
        if (corpusStats.fallbackExamples.length < 6) {
          corpusStats.fallbackExamples.push({
            company: (r.fields || {})[CO] || "", id: r.id,
            raw: e.raw.trim().slice(0, 160)
          });
        }
      }
    }
    // content preservation across the whole base — the STRICT per-entry check
    const rendered = contentSig(textOf(T.renderTimeline(notes)));
    for (const e of entries) {
      const expected = contentSig(e.raw.replace(MARKER_HEAD, ""));
      if (reassemble(e) !== expected || !rendered.includes(reassemble(e, false))) {
        corpusStats.lossy.push({
          company: (r.fields || {})[CO] || "", id: r.id,
          head: (e.headline || e.raw).slice(0, 70)
        });
        break;
      }
    }
    // is stored order actually chronological?
    const iso = entries.map(e => e.dateIso).filter(Boolean);
    for (let i = 1; i < iso.length; i++) {
      if (iso[i] < iso[i - 1]) {
        corpusStats.outOfOrder.push({
          company: (r.fields || {})[CO] || "", id: r.id, at: `${iso[i - 1]} -> ${iso[i]}`
        });
        break;
      }
    }
  }
}

/* ---- report ----------------------------------------------------------- */
console.log("\n" + "=".repeat(64));
console.log(`UNIT TESTS:  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n       ${f.detail}`);
}
if (corpusStats) {
  const c = corpusStats;
  console.log("\nCORPUS SWEEP (every Notes value in the base):");
  console.log(`  records with notes ........ ${c.records}`);
  console.log(`  entries parsed ............ ${c.entries}`);
  console.log(`  clean structured parses ... ${c.clean} (${(c.clean / c.entries * 100).toFixed(1)}%)`);
  console.log(`  plain-text fallbacks ...... ${c.fallback} (${(c.fallback / c.entries * 100).toFixed(1)}%)`);
  console.log(`  records losing content .... ${c.lossy.length}`);
  console.log(`  records stored out of date order ... ${c.outOfOrder.length}`);
  if (c.fallbackExamples.length) {
    console.log("\n  fallback examples:");
    for (const f of c.fallbackExamples) console.log(`    [${f.company}] ${JSON.stringify(f.raw)}`);
  }
  if (c.lossy.length) {
    console.log("\n  CONTENT LOSS (must be empty):");
    for (const l of c.lossy.slice(0, 10)) console.log(`    [${l.company}] ${l.id} ${l.src} -> ${l.out}`);
  }
  if (c.outOfOrder.length) {
    console.log("\n  stored out of order (rendered in stored order regardless):");
    for (const o of c.outOfOrder.slice(0, 10)) console.log(`    [${o.company}] ${o.at}`);
  }
}
console.log("=".repeat(64) + "\n");
process.exit(failed ? 1 : 0);
