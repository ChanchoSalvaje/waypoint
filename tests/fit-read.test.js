/* ============================================================
   Tests for public/fit-read.js
   Run:  node tests/fit-read.test.js
   No dependencies, no network, no Airtable calls.

   Every sample below is SYNTHETIC. It copies the shapes the mine
   writes (verdict, "; "-joined caveats, sentence breaks, a caps
   flag label, a trailing "if" qualifier) with invented companies
   and details. Do not paste real Fit Read values into this file.

   Optional corpus sweep: WP_FITREAD_CORPUS=<path to a JSON array
   of Fit Read strings>. Generated read-only; never committed.
   ============================================================ */
"use strict";

const fs = require("fs");
const F = require("../public/fit-read.js");

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) passed++; else { failed++; failures.push({ name, detail }); }
}
function eq(name, a, b) {
  ok(name, a === b, `expected ${JSON.stringify(b)}\n       got      ${JSON.stringify(a)}`);
}

function textOf(html) {
  return html.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
// Whitespace-insensitive. The "; " separators are the one thing the layout
// consumes (they become list structure), so they are removed from the source
// side only where the parser consumed them.
const sig = s => s.replace(/\s+/g, "");

function preserves(src) {
  const clauses = F.parseFitRead(src);
  if (!clauses) return { ok: true, fallback: true };
  const rawJoin = clauses.map(c => c.raw).join("");
  if (rawJoin !== src) return { ok: false, why: "raw slices do not rebuild the input" };
  const html = F.renderFitRead(src);
  const shown = sig(textOf(html));
  const expected = sig(clauses.map(c => c.body).join(""));
  if (shown !== expected) return { ok: false, why: `shown ${shown.length} vs expected ${expected.length}` };
  // what was dropped between input and display is exactly the consumed ";"
  const dropped = sig(src).length - shown.length;
  const semis = clauses.filter(c => c.sep === ";").length;
  if (dropped !== semis) return { ok: false, why: `dropped ${dropped} chars, consumed ${semis} semicolons` };
  return { ok: true };
}

const SAMPLES = [
  "Director-level program role at a regional logistics firm; $150–175K floor clears gate, below target — negotiable; confirm internal PMO vs client delivery before pursuing.",
  "Strong identity match to the AI Enablement lane (retail-AI). LOCATION FLAG: alert lists Denver, CO and Austin, TX with no remote tag — CONFIRM remote-US eligibility; if on-site only, out of location scope. Comp unposted — confirm >= gate.",
  "Sr. Director, Enterprise Programs (PMO lane), remote; employer industry unverified — confirm it is not a lending employer; comp unposted.",
  "Transformation lead at a hospital network — but 'Lead' level is ambiguous; confirm Manager+ scope. ~ Est. $140K–$170K. Distinct from the prior Closed row at the same employer.",
  "Program director at a media company, remote-US; flag: title may skew to ad-sales operations — confirm scope; comp unposted.",
  "Clean PMO fit at a software company.",
  "Requires 7+ yrs building AI products vs. enablement — confirm scope; comp above target.",
];

console.log("\n— Content preservation (synthetic samples) —");
for (const s of SAMPLES) {
  const r = preserves(s);
  ok("preserves: " + s.slice(0, 50), r.ok, r.why);
}

console.log("— Structure —");
{
  const c = F.parseFitRead(SAMPLES[0]);
  eq("3 clauses", c.length, 3);
  eq("lead is the verdict", c[0].body, "Director-level program role at a regional logistics firm");
  eq("comp clause is a note", F._kindOf(c[1].body), "note");
  eq("confirm clause is a check", F._kindOf(c[2].body), "check");
  eq("sentence period is kept", c[2].body.slice(-1), ".");
}
{
  const c = F.parseFitRead(SAMPLES[1]);
  eq("sentence breaks split too", c.length, 3);
  eq("flag clause detected", F._kindOf(c[1].body), "flag");
  ok("'if' qualifier stays with its clause, semicolon included",
     c[1].body.endsWith("eligibility; if on-site only, out of location scope."), c[1].body);
  const html = F.renderFitRead(SAMPLES[1]);
  ok("flag label rendered as a styled span, text intact",
     html.includes('<span class="fr-flag">LOCATION FLAG:</span>'), html);
}
{
  const c = F.parseFitRead(SAMPLES[2]);
  eq("'Sr.' is not a sentence end", c[0].body, "Sr. Director, Enterprise Programs (PMO lane), remote");
}
{
  const c = F.parseFitRead(SAMPLES[3]);
  ok("'~ Est.' is not a sentence end", c.some(x => x.body === "~ Est. $140K–$170K."),
     JSON.stringify(c.map(x => x.body)));
}
{
  eq("lower-case 'flag:' label", F._kindOf(F.parseFitRead(SAMPLES[4])[1].body), "flag");
}
{
  const c = F.parseFitRead(SAMPLES[6]);
  eq("'vs.' is not a sentence end", c.length, 2);
}
{
  const html = F.renderFitRead(SAMPLES[5]);
  ok("single clause -> lead only, no list", !html.includes("fr-list"), html);
}

console.log("— Fallback to the markdown path —");
eq("multi-paragraph -> null", F.renderFitRead("Line one.\n\nLine two."), null);
eq("markdown bullets -> null", F.renderFitRead("- one\n- two"), null);
eq("bold markup -> null", F.renderFitRead("**Verdict:** fine"), null);
eq("empty -> null", F.renderFitRead(""), null);
eq("null -> null", F.renderFitRead(null), null);
ok("trailing newline alone does not force fallback",
   F.renderFitRead("Clean fit; comp unposted.\n") !== null, "");

console.log("— Escaping —");
{
  const html = F.renderFitRead("Fit <b>x</b> & \"y\"; confirm <script>alert(1)</script>.");
  ok("no raw tags", !html.includes("<script>") && !html.includes("<b>"), html);
  ok("ampersand escaped", html.includes("&amp;"), html);
}

let sweep = null;
const cp = process.env.WP_FITREAD_CORPUS;
if (cp && fs.existsSync(cp)) {
  const reads = JSON.parse(fs.readFileSync(cp, "utf8"));
  sweep = { total: reads.length, structured: 0, fallback: 0, lossy: 0 };
  for (const r of reads) {
    const res = preserves(r);
    if (!res.ok) sweep.lossy++;
    else if (res.fallback) sweep.fallback++;
    else sweep.structured++;
  }
}

console.log("\n" + "=".repeat(64));
console.log(`UNIT TESTS:  ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  ✗ ${f.name}\n       ${f.detail}`);
if (sweep) console.log(`CORPUS: ${sweep.total} reads · ${sweep.structured} laid out · ${sweep.fallback} markdown fallback · ${sweep.lossy} losing content (must be 0)`);
console.log("=".repeat(64) + "\n");
process.exit(failed ? 1 : 0);
