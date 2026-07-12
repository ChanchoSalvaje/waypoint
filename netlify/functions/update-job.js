// netlify/functions/update-job.js
// ---------------------------------------------------------------------------
// Slice 2 — WRITE path (update-only). PATCHes a SINGLE existing record and may
// write ONLY five whitelisted fields:
//   • Stage       (single-select) — validated against the real option names
//   • Next Action (text)
//   • Excitement  (number, integer 1–5) — self-rated. Fit Score stays read-only.
//   • Pursue      (checkbox/boolean) — ticking it queues the job for the daily
//                  enrichment run.
//   • Notes       (text) — APPEND-ONLY: a new dated line is added; existing
//                  Notes content is read first and never overwritten or deleted.
//
// CLOSE: passing `closeReason` performs an atomic close — Stage→Closed, Pursue→false,
// Next Action + Next Action By cleared, and an append-only dated Notes line
// "[YYYY-MM-DD]: Closed by Tim via Waypoint — <reason>. Not a rejection." No delete.
//
// SECURITY: this is a write endpoint. The whole site — including this function —
// sits behind HTTP Basic Auth enforced by netlify/edge-functions/auth.js (path
// "/*"), so it is already password-gated in production. Keep it that way: never
// deploy this publicly without that gate in front of it.
//
// Hard guarantees:
//   - Update-only: PATCHes one record id. Never creates or deletes.
//   - Field whitelist: only stage / nextAction / excitement / pursue / noteAppend
//     are read from the body, and only those five field IDs are ever written.
//   - Append-only Notes: the client sends only NEW note text (`noteAppend`).
//     The server reads the current Notes value and appends
//     "YYYY-MM-DD: <text>" below it. The client can never supply the full blob,
//     so it cannot overwrite history.
//   - Stage is validated server-side; typecast can only match an EXISTING
//     option, never invent one.
//
// The Airtable token is read from AIRTABLE_TOKEN (server-side only).
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const TABLE_ID = "tblWZyC4j4z12roVq";

const STAGE_FIELD = "fldE1YGHZdjiPIkiR";       // Stage (singleSelect)
const NEXT_ACTION_FIELD = "fldQjbPglCq07XJJD"; // Next Action (multilineText)
const NOTES_FIELD = "fldXN9uz1ZcIFtsKm";       // Notes (multilineText)
const EXCITEMENT_FIELD = "fldOzdAtFpCpi2GVU";  // Excitement (number, integer 1–5)
const PURSUE_FIELD = "fldk41nshQmCXHanE";      // Pursue (checkbox / boolean)
const NEXT_ACTION_BY_FIELD = "fld3pSuhVDc8gW4cU"; // Next Action By (date) — cleared on Close

// Exact live option names for Stage (confirmed against the schema).
const ALLOWED_STAGES = [
  "Saved", "Tailoring", "Ready to apply", "Applied",
  "Screening", "Interviewing", "Offer", "Closed",
];

// "YYYY-MM-DD HH:MM MST" in Arizona time (America/Phoenix has no DST, so it is
// always MST). Uses Intl with an explicit timeZone, so the result is correct
// regardless of the server's own timezone (local Mac in dev, UTC in production).
function phoenixStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} MST`;
}
// "YYYY-MM-DD" in Arizona time (date only) — used for the Close note stamp.
function phoenixDate() { return phoenixStamp().slice(0, 10); }

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed — use POST." });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return json(500, { error: "AIRTABLE_TOKEN is not set on the server." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Invalid JSON body." });
  }

  const id = body.id;
  if (typeof id !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return json(400, { error: "A valid Airtable record id is required." });
  }

  // Build the update from ONLY the whitelisted inputs. Anything else is ignored.
  const fields = {};

  if (body.stage !== undefined) {
    if (typeof body.stage !== "string" || ALLOWED_STAGES.indexOf(body.stage) === -1) {
      return json(400, { error: "Invalid Stage. Allowed: " + ALLOWED_STAGES.join(", ") });
    }
    fields[STAGE_FIELD] = body.stage;
  }

  if (body.nextAction !== undefined) {
    if (typeof body.nextAction !== "string") {
      return json(400, { error: "Next Action must be text." });
    }
    if (body.nextAction.length > 10000) {
      return json(400, { error: "Next Action is too long (max 10000 chars)." });
    }
    fields[NEXT_ACTION_FIELD] = body.nextAction;
  }

  // Excitement: self-rated integer 1–5. Fit Score is intentionally NOT writable.
  if (body.excitement !== undefined && body.excitement !== null && body.excitement !== "") {
    const n = Number(body.excitement);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return json(400, { error: "Excitement must be an integer from 1 to 5." });
    }
    fields[EXCITEMENT_FIELD] = n;
  }

  // Pursue: boolean checkbox. Ticking it queues the job for the daily enrichment run.
  if (body.pursue !== undefined) {
    if (typeof body.pursue !== "boolean") {
      return json(400, { error: "Pursue must be true or false." });
    }
    fields[PURSUE_FIELD] = body.pursue;
  }

  // Notes are append-only. Whatever we append is computed here as `appendEntry`
  // (a single pre-formatted line); the read+append happens below (needs await).
  let appendEntry = null;
  if (body.noteAppend !== undefined) {
    if (typeof body.noteAppend !== "string" || body.noteAppend.trim() === "") {
      return json(400, { error: "Note text is required to append a note." });
    }
    const noteText = body.noteAppend.trim();
    if (noteText.length > 5000) {
      return json(400, { error: "Note is too long (max 5000 chars)." });
    }
    appendEntry = `${phoenixStamp()}: ${noteText}`;
  }

  // Close action (one atomic call): Stage→Closed, Pursue→false, Next Action + Next
  // Action By cleared, and an append-only dated Notes line. Closing is a direct write
  // (no research needed) — it never deletes; the closed row stays as dedupe memory.
  if (body.closeReason !== undefined) {
    if (typeof body.closeReason !== "string" || body.closeReason.trim() === "") {
      return json(400, { error: "A close reason is required." });
    }
    const reason = body.closeReason.trim().slice(0, 300);
    fields[STAGE_FIELD] = "Closed";
    fields[PURSUE_FIELD] = false;
    fields[NEXT_ACTION_FIELD] = "";
    fields[NEXT_ACTION_BY_FIELD] = null;
    appendEntry = `[${phoenixDate()}]: Closed by Tim via Waypoint — ${reason}. Not a rejection.`;
  }

  if (Object.keys(fields).length === 0 && appendEntry === null) {
    return json(400, { error: "Nothing to update — provide stage, nextAction, excitement, pursue, noteAppend, and/or closeReason." });
  }

  try {
    // APPEND-ONLY: read the current Notes FIRST, then add the dated line below it.
    if (appendEntry !== null) {
      const getUrl =
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}?returnFieldsByFieldId=true`;
      const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!getResp.ok) {
        const detail = await getResp.text();
        return json(getResp.status, {
          error: `Couldn't read current Notes to append safely (${getResp.status}).`,
          detail,
        });
      }
      const cur = await getResp.json();
      const existing = (cur.fields && cur.fields[NOTES_FIELD]) || "";
      fields[NOTES_FIELD] = existing ? `${existing}\n${appendEntry}` : appendEntry;
    }

    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
    const resp = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: true }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json(resp.status, { error: `Airtable update failed (${resp.status}).`, detail });
    }

    const rec = await resp.json();
    const f = rec.fields || {};
    // Airtable's PATCH response keys fields by NAME (returnFieldsByFieldId is
    // honored on reads, not writes), so accept either the field ID or the name.
    const pick = (idKey, name) => (f[idKey] !== undefined ? f[idKey] : f[name]);
    return json(200, {
      ok: true,
      id: rec.id,
      stage: pick(STAGE_FIELD, "Stage") || "",
      nextAction: pick(NEXT_ACTION_FIELD, "Next Action") || "",
      notes: pick(NOTES_FIELD, "Notes") || "",
      excitement: pick(EXCITEMENT_FIELD, "Excitement") ?? null,
      pursue: !!pick(PURSUE_FIELD, "Pursue"),
    });
  } catch (err) {
    return json(500, { error: "Unexpected error updating Airtable.", detail: String(err) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
