// netlify/functions/signals.js
// ---------------------------------------------------------------------------
// Signals board backend. Reads the Signals table (joined to the Watchlist for
// the "why listed" caption) and writes STATUS changes + append-only Notes.
//
//   GET  → every Signals row, mapped for the board, each joined by company name
//          to its Watchlist "Why Listed" + "Tier" (one Watchlist fetch per load,
//          no per-card calls). No match → no caption.
//   POST → one of:
//          • {id, status[, reason][, note]} — change Status and append a dated
//            Notes line. Standard line "[date]: Status → X by Tim via Waypoint
//            [ — reason]", OR a custom `note` line when supplied (e.g. Mark sent
//            → status Pitched + "[date]: Outreach sent by Tim"). Dismiss requires
//            a reason.
//          • {id, noteAppend} — append "[date]: <text>" only (the per-card Add
//            note box); no status change.
//        All appends are read-then-concatenate, typecast:true, never overwrite.
//
// SECURITY: the Airtable token stays server-side (AIRTABLE_TOKEN), behind the
// Basic-Auth edge gate. Field IDs are hardcoded (the prod token has data scope
// only) — NO schema/meta API calls. Writes touch ONLY Status + Notes.
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const TABLE_ID = "tbl2pSoKACtdKdLNO";
const WATCHLIST_ID = "tblzwXPsedzGgLH9D";

// Exact live field IDs (hardcoded — no schema call).
const F = {
  signal:    "fld2DD7CSHZ6tlZnE", // Signal (primary, title)
  company:   "fldCGv88KNnaj41iA", // Company
  date:      "fld3QDDg7wCMjbyqr", // Date Spotted (date)
  type:      "fldcgppVwXEu9zr6i", // Signal Type (singleSelect)
  summary:   "fldAyKdRoSTifQ4my", // Summary (long text)
  sourceUrl: "fldEFbq1kwOiHCfXg", // Source URL (url)
  angle:     "fldilFOooDr6Y4S77", // Suggested Angle (long text)
  status:    "fld7VMToOnBI5jJXj", // Status (singleSelect)
  notes:     "fldEEoNM55NtN25K3", // Notes (long text, APPEND-ONLY)
  staged:    "fldLjlCnP7aCkHbik", // Staged Outreach (long text)
};
// Watchlist fields used for the "why listed" caption.
const W = {
  company:   "fldHoU12GtcHdwyVU", // Company
  whyListed: "fld8v0jjIlV9sK5R5", // Why Listed (long text)
  tier:      "fldtTHCAfrX4aIHYt", // Tier (singleSelect: "1 — …" / "2 — …" …)
};

const ALLOWED_STATUS = ["New", "Reviewing", "Pitched", "Dismissed"];

const AT = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
const AT_WATCH = `https://api.airtable.com/v0/${BASE_ID}/${WATCHLIST_ID}`;

// "YYYY-MM-DD" in Arizona time (America/Phoenix, no DST), correct on any server.
function phoenixDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}
const norm = (s) => String(s || "").trim().toLowerCase();

// Fetch every page of a table (only the given fields).
async function fetchAll(token, base, fieldIds) {
  const records = [];
  let offset;
  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    (fieldIds || []).forEach((f) => url.searchParams.append("fields[]", f));
    if (offset) url.searchParams.set("offset", offset);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`read ${resp.status}: ${await resp.text()}`);
    const page = await resp.json();
    records.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return records;
}

// Map one Signals record to the board shape, joined to its Watchlist entry.
function mapRecord(record, watchMap) {
  const f = record.fields || {};
  const w = watchMap[norm(f[F.company])] || null;
  return {
    id:        record.id,
    signal:    f[F.signal] || "",
    company:   f[F.company] || "",
    date:      f[F.date] || "",
    type:      f[F.type] || "",
    summary:   f[F.summary] || "",
    sourceUrl: f[F.sourceUrl] || "",
    angle:     f[F.angle] || "",
    status:    f[F.status] || "New",
    notes:     f[F.notes] || "",
    staged:    f[F.staged] || "",
    whyListed: w ? (w.whyListed || "") : "",
    tier:      w ? (w.tier || "") : "",
  };
}

async function readNotes(token, id) {
  const resp = await fetch(`${AT}/${id}?returnFieldsByFieldId=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`read ${resp.status}: ${await resp.text()}`);
  const cur = await resp.json();
  return (cur.fields && cur.fields[F.notes]) || "";
}

exports.handler = async function (event) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return json(500, { error: "AIRTABLE_TOKEN is not set on the server." });

  try {
    if (event.httpMethod === "GET") {
      const signals = await fetchAll(token, AT, Object.values(F));
      // Build the Watchlist join map (once). If it fails, ship signals without captions.
      let watchMap = {};
      try {
        const watch = await fetchAll(token, AT_WATCH, [W.company, W.whyListed, W.tier]);
        watch.forEach((r) => {
          const wf = r.fields || {};
          const key = norm(wf[W.company]);
          if (key) watchMap[key] = { whyListed: wf[W.whyListed] || "", tier: wf[W.tier] || "" };
        });
      } catch (_) { watchMap = {}; }
      return json(200, { signals: signals.map((r) => mapRecord(r, watchMap)) });
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); }
      catch (_) { return json(400, { error: "Invalid JSON body." }); }

      const id = body.id;
      if (typeof id !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
        return json(400, { error: "A valid Airtable record id is required." });
      }

      const stamp = phoenixDate();
      const fields = {};
      let appendLine = null;

      if (body.status !== undefined) {
        // ---- status change (+ optional custom note) ----
        if (typeof body.status !== "string" || ALLOWED_STATUS.indexOf(body.status) === -1) {
          return json(400, { error: "Invalid Status. Allowed: " + ALLOWED_STATUS.join(", ") });
        }
        fields[F.status] = body.status;
        if (typeof body.note === "string" && body.note.trim()) {
          appendLine = `[${stamp}]: ${body.note.trim().slice(0, 500)}`;
        } else if (body.status === "Dismissed") {
          if (typeof body.reason !== "string" || body.reason.trim() === "") {
            return json(400, { error: "A reason is required to dismiss a signal." });
          }
          appendLine = `[${stamp}]: Status → Dismissed by Tim via Waypoint — ${body.reason.trim().slice(0, 300)}.`;
        } else {
          appendLine = `[${stamp}]: Status → ${body.status} by Tim via Waypoint.`;
        }
      } else if (body.noteAppend !== undefined) {
        // ---- note-only append (per-card Add note box) ----
        if (typeof body.noteAppend !== "string" || body.noteAppend.trim() === "") {
          return json(400, { error: "Note text is required to append a note." });
        }
        appendLine = `[${stamp}]: ${body.noteAppend.trim().slice(0, 2000)}`;
      } else {
        return json(400, { error: "Provide a status or noteAppend." });
      }

      // APPEND-ONLY: read current Notes, then concatenate the new dated line.
      const existing = await readNotes(token, id);
      fields[F.notes] = existing ? `${existing}\n${appendLine}` : appendLine;

      const resp = await fetch(`${AT}/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        return json(resp.status, { error: `Airtable update failed (${resp.status}).`, detail });
      }
      // Re-read by field ID for an authoritative mapped result (no Watchlist join needed here).
      const reread = await fetch(`${AT}/${id}?returnFieldsByFieldId=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rec = await reread.json();
      return json(200, { ok: true, signal: mapRecord(rec, {}) });
    }

    return json(405, { error: "Method not allowed — use GET or POST." });
  } catch (err) {
    return json(500, { error: "Unexpected error in signals function.", detail: String(err) });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
