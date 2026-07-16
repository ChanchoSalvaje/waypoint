// netlify/functions/health.js
// ---------------------------------------------------------------------------
// Backdoor health strip (Waypoint UI addendum, component B). READ-ONLY.
// Answers "is the machine alive?" at a glance by deriving four numbers from the
// Watchlist and Signals tables — no new tables, no new fields, no writes:
//   • Last ATS poll   — most recent Last Polled across Watchlist + count of
//                       Status = "Probe failed — needs slug"
//   • Last signals sweep — most recent Date Spotted in Signals (a good-enough proxy)
//   • Signals awaiting eyes — count of New + count of Reviewing
//   • Watchlist coverage — Active count / total
// Color logic (per the addendum): green if poll < 48h and sweep < 8 days; amber
// otherwise; red if either is worse than 2× those thresholds.
//
// SECURITY: the Airtable token stays server-side (AIRTABLE_TOKEN). The whole
// site, including this function, sits behind the Basic-Auth edge gate.
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const WATCHLIST_ID = "tblzwXPsedzGgLH9D";
const SIGNALS_ID = "tbl2pSoKACtdKdLNO";

const WL = {
  status:     "fldH0nDiUWii8VDyb", // Status (singleSelect: Active / Paused / Probe failed — needs slug)
  lastPolled: "fldf4dgLbSwL1PNuA", // Last Polled (date)
};
const SIG = {
  date:   "fld3QDDg7wCMjbyqr", // Date Spotted (date)
  status: "fld7VMToOnBI5jJXj", // Status (singleSelect)
};
const PROBE_FAILED = "Probe failed — needs slug";

const AT = (tbl) => `https://api.airtable.com/v0/${BASE_ID}/${tbl}`;

function phoenixDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}
// Whole days between two YYYY-MM-DD strings (b - a). Positive = a is in the past.
function ageDays(iso, today) {
  if (!iso) return null;
  return Math.round((new Date(today + "T00:00:00") - new Date(iso + "T00:00:00")) / 86400000);
}
function maxIso(arr) { return arr.filter(Boolean).slice().sort().slice(-1)[0] || ""; }

// Green under threshold, red past 2× threshold, amber between. null age = red (unknown).
function metricColor(age, warnDays, redDays) {
  if (age == null) return "red";
  if (age < warnDays) return "green";
  if (age > redDays) return "red";
  return "amber";
}
const RANK = { green: 0, amber: 1, red: 2 };
function worst(a, b) { return RANK[a] >= RANK[b] ? a : b; }

async function fetchAll(token, tbl, fieldIds) {
  const records = [];
  let offset;
  do {
    const url = new URL(AT(tbl));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    fieldIds.forEach((f) => url.searchParams.append("fields[]", f));
    if (offset) url.searchParams.set("offset", offset);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`${tbl} read ${resp.status}: ${await resp.text()}`);
    const page = await resp.json();
    records.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return records;
}

exports.handler = async function () {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return json(500, { error: "AIRTABLE_TOKEN is not set on the server." });

  try {
    const today = phoenixDate();
    const [watch, signals] = await Promise.all([
      fetchAll(token, WATCHLIST_ID, [WL.status, WL.lastPolled]),
      fetchAll(token, SIGNALS_ID, [SIG.date, SIG.status]),
    ]);

    // ---- Watchlist-derived ----
    let active = 0, probeFailed = 0;
    const pollDates = [];
    watch.forEach((r) => {
      const f = r.fields || {};
      const st = f[WL.status] || "";
      if (st === "Active") active++;
      if (st === PROBE_FAILED) probeFailed++;
      if (f[WL.lastPolled]) pollDates.push(f[WL.lastPolled]);
    });
    const lastPoll = maxIso(pollDates);
    const pollAge = ageDays(lastPoll, today);

    // ---- Signals-derived ----
    let sNew = 0, sReviewing = 0;
    const sweepDates = [];
    signals.forEach((r) => {
      const f = r.fields || {};
      const st = f[SIG.status] || "";
      if (st === "New") sNew++;
      if (st === "Reviewing") sReviewing++;
      if (f[SIG.date]) sweepDates.push(f[SIG.date]);
    });
    const lastSweep = maxIso(sweepDates);
    const sweepAge = ageDays(lastSweep, today);

    // ---- Color logic (48h ≈ 2 days; 8 days; red past 2×) ----
    const pollColor = metricColor(pollAge, 2, 4);
    const sweepColor = metricColor(sweepAge, 8, 16);

    return json(200, {
      ok: true,
      today,
      poll: { last: lastPoll, ageDays: pollAge, probeFailed, color: pollColor },
      sweep: { last: lastSweep, ageDays: sweepAge, color: sweepColor },
      awaiting: { new: sNew, reviewing: sReviewing },
      coverage: { active, total: watch.length },
      color: worst(pollColor, sweepColor),
    });
  } catch (err) {
    return json(500, { error: "Unexpected error computing health.", detail: String(err) });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
