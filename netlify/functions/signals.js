// netlify/functions/signals.js
// ---------------------------------------------------------------------------
// Signals board backend (Waypoint UI addendum, component A). Reads the Signals
// table and writes STATUS CHANGES only.
//   GET → returns every Signals row, mapped to the shape the board renders.
//   POST → changes ONE row's Status (New/Reviewing/Pitched/Dismissed) and
//          APPENDS a dated Notes line ("[YYYY-MM-DD]: Status → X by Tim via
//          Waypoint[ — reason]"). Read-then-concatenate, so Notes history is
//          never overwritten. Dismiss requires a reason (lands in the note).
//
// SECURITY: the Airtable token stays server-side (AIRTABLE_TOKEN). The whole
// site, including this function, sits behind the Basic-Auth edge gate (auth.js,
// "/*"). This endpoint writes ONLY Status + an append to Notes — no other field,
// no create, no delete. Content fields (Summary, Angle, etc.) are never touched.
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const TABLE_ID = "tbl2pSoKACtdKdLNO";

// Exact live field IDs (confirmed against the Airtable schema, not assumed).
const F = {
  signal:     "fld2DD7CSHZ6tlZnE", // Signal (primary, title)
  company:    "fldCGv88KNnaj41iA", // Company
  date:       "fld3QDDg7wCMjbyqr", // Date Spotted (date)
  type:       "fldcgppVwXEu9zr6i", // Signal Type (singleSelect)
  summary:    "fldAyKdRoSTifQ4my", // Summary (long text)
  sourceUrl:  "fldEFbq1kwOiHCfXg", // Source URL (url)
  angle:      "fldilFOooDr6Y4S77", // Suggested Angle (long text)
  status:     "fld7VMToOnBI5jJXj", // Status (singleSelect)
  notes:      "fldEEoNM55NtN25K3", // Notes (long text, APPEND-ONLY)
};

// Live Status option names (confirmed against the schema).
const ALLOWED_STATUS = ["New", "Reviewing", "Pitched", "Dismissed"];

const AT = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

// "YYYY-MM-DD" in Arizona time (America/Phoenix has no DST → always MST),
// correct regardless of the server's own timezone.
function phoenixDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}

// Turn one Airtable record into the signal shape the board renders.
function mapRecord(record) {
  const f = record.fields || {};
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
  };
}

exports.handler = async function (event) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return json(500, { error: "AIRTABLE_TOKEN is not set on the server." });

  try {
    if (event.httpMethod === "GET") {
      const records = [];
      let offset;
      do {
        const url = new URL(AT);
        url.searchParams.set("pageSize", "100");
        url.searchParams.set("returnFieldsByFieldId", "true");
        if (offset) url.searchParams.set("offset", offset);
        const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          const detail = await resp.text();
          return json(resp.status, { error: `Airtable request failed (${resp.status}).`, detail });
        }
        const page = await resp.json();
        records.push(...(page.records || []));
        offset = page.offset;
      } while (offset);
      return json(200, { signals: records.map(mapRecord) });
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); }
      catch (_) { return json(400, { error: "Invalid JSON body." }); }

      const id = body.id;
      if (typeof id !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
        return json(400, { error: "A valid Airtable record id is required." });
      }
      if (typeof body.status !== "string" || ALLOWED_STATUS.indexOf(body.status) === -1) {
        return json(400, { error: "Invalid Status. Allowed: " + ALLOWED_STATUS.join(", ") });
      }
      // Dismiss requires a one-line reason (mirrors the Close action).
      let reason = "";
      if (body.status === "Dismissed") {
        if (typeof body.reason !== "string" || body.reason.trim() === "") {
          return json(400, { error: "A reason is required to dismiss a signal." });
        }
        reason = body.reason.trim().slice(0, 300);
      }

      // Build the append-only Notes line.
      const line = reason
        ? `[${phoenixDate()}]: Status → ${body.status} by Tim via Waypoint — ${reason}.`
        : `[${phoenixDate()}]: Status → ${body.status} by Tim via Waypoint.`;

      // APPEND-ONLY: read the current Notes first, then add the dated line below it.
      const getResp = await fetch(`${AT}/${id}?returnFieldsByFieldId=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!getResp.ok) {
        const detail = await getResp.text();
        return json(getResp.status, { error: `Couldn't read the signal to update safely (${getResp.status}).`, detail });
      }
      const cur = await getResp.json();
      const existing = (cur.fields && cur.fields[F.notes]) || "";

      const fields = {};
      fields[F.status] = body.status;
      fields[F.notes] = existing ? `${existing}\n${line}` : line;

      const resp = await fetch(`${AT}/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        return json(resp.status, { error: `Airtable update failed (${resp.status}).`, detail });
      }
      // Re-read by field ID for an authoritative mapped result (PATCH responses key by name).
      const reread = await fetch(`${AT}/${id}?returnFieldsByFieldId=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rec = await reread.json();
      return json(200, { ok: true, signal: mapRecord(rec) });
    }

    return json(405, { error: "Method not allowed — use GET or POST." });
  } catch (err) {
    return json(500, { error: "Unexpected error in signals function.", detail: String(err) });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
