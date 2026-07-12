// netlify/functions/settings.js
// ---------------------------------------------------------------------------
// Slice 4 — Settings (admin) tab backend. Reads/writes the single Settings record.
//   GET → returns the current settings (mapped to friendly keys).
//   PUT → writes only the CHANGED fields (typecast) and APPENDS a dated Change
//         Log line summarizing exactly what changed (read-then-concatenate).
//
// SECURITY: the Airtable token stays server-side (AIRTABLE_TOKEN). The whole site,
// including this function, sits behind the Basic-Auth edge gate (auth.js, "/*").
// Change Log is append-only — the current value is read and the new line is
// concatenated; it is never overwritten.
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const TABLE_ID = "tbl4RoBe4zpDora2R";
const RECORD_ID = "rec8AOV2LggO8KTMe"; // the single "Active" settings record

const F = {
  preset:     "fldypEil8ct1HgitB", // Posture Preset (singleSelect)
  gate:       "fldmlmyr23ugZnIX5", // Comp Gate ($) (number)
  target:     "fld93mraGps6DF1xK", // Comp Target ($) (number)
  basis:      "fldPMHT68IZAMhAz3", // Comp Basis (singleSelect)
  level:      "fld6U4QdQ6PLjxno6", // Level Floor (singleSelect)
  laneAI:     "fldC2kKLFCn0tNTPI", // Lane: AI Enablement (checkbox)
  lanePMO:    "fldDH5QI5sOH5aGHF", // Lane: PMO & Portfolio (checkbox)
  laneTO:     "fldwUjQbwx8FWMjJG", // Lane: Transformation Office (checkbox)
  vocabAI:    "fldD9zJNWU20x4GVH", // Vocab: AI Enablement (long text)
  vocabPMO:   "fld4viYv94a7Ge6cc", // Vocab: PMO & Portfolio (long text)
  vocabTO:    "fldw3vcQyLeUVSFPi", // Vocab: Transformation Office (long text)
  exclusions: "fldjwn2cTr1cUvsNW", // Industry Exclusions (long text)
  location:   "fldpVqB4CTG5X0soy", // Location Mode (singleSelect)
  resweep:    "fldccNwkIR7qmA265", // Re-sweep Requested (checkbox)
  changeLog:  "fldYpil6Fjww6WLxc", // Change Log (long text, APPEND-ONLY)
};

const PRESETS  = ["Reach & Pivot", "Land Fast", "Custom"];
const BASES    = ["Base only", "Base + guaranteed bonus", "Total cash comp"];
const LEVELS   = ["None", "Manager+", "Director+"];
const LOCATIONS = ["Remote-US or Tucson", "Remote-US only"];

const AT = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

function phoenixDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}
const fmtK = (n) => (n == null || n === "" ? "unset" : "$" + Math.round(Number(n) / 1000) + "K");

// Map an Airtable record's fields (by field ID) to the friendly settings shape.
function mapRecord(f) {
  f = f || {};
  return {
    preset:     f[F.preset] || "",
    gate:       f[F.gate] ?? null,
    target:     f[F.target] ?? null,
    basis:      f[F.basis] || "",
    level:      f[F.level] || "",
    lanes:      { ai: !!f[F.laneAI], pmo: !!f[F.lanePMO], to: !!f[F.laneTO] },
    vocab:      { ai: f[F.vocabAI] || "", pmo: f[F.vocabPMO] || "", to: f[F.vocabTO] || "" },
    exclusions: f[F.exclusions] || "",
    location:   f[F.location] || "",
    resweep:    !!f[F.resweep],
    changeLog:  f[F.changeLog] || "",
  };
}

async function getRecord(token) {
  const res = await fetch(`${AT}/${RECORD_ID}?returnFieldsByFieldId=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`read ${res.status}: ${await res.text()}`);
  return (await res.json()).fields || {};
}

exports.handler = async function (event) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return json(500, { error: "AIRTABLE_TOKEN is not set on the server." });

  try {
    if (event.httpMethod === "GET") {
      return json(200, { ok: true, settings: mapRecord(await getRecord(token)) });
    }
    if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); }
      catch (_) { return json(400, { error: "Invalid JSON body." }); }

      const cur = await getRecord(token);       // old values (for the diff) + current Change Log
      const old = mapRecord(cur);
      const fields = {};                          // only changed fields go here
      const frags = [];                           // Change Log summary fragments

      // ---- selects (validated) ----
      const setSelect = (key, allowed, label) => {
        if (body[key] === undefined) return;
        const v = body[key] == null ? "" : String(body[key]);
        if (v !== "" && allowed.indexOf(v) === -1) throw new Error(`Invalid ${label}: "${v}"`);
        if (v !== old[key]) { fields[F[key]] = v || null; if (label !== "Preset") frags.push(`${label} ${old[key] || "unset"}→${v || "unset"}`); }
      };
      setSelect("preset", PRESETS, "Preset");     // preset change is implied by lane/level; not spelled out
      setSelect("basis", BASES, "Basis");
      setSelect("level", LEVELS, "Level Floor");
      setSelect("location", LOCATIONS, "Location Mode");

      // ---- numbers ----
      for (const key of ["gate", "target"]) {
        if (body[key] === undefined) continue;
        const n = body[key] === null || body[key] === "" ? null : Number(body[key]);
        if (n !== null && !Number.isFinite(n)) throw new Error(`${key} must be a number`);
        if (n !== old[key]) { fields[F[key]] = n; frags.push(`${key === "gate" ? "Gate" : "Target"} ${fmtK(old[key])}→${fmtK(n)}`); }
      }

      // ---- lanes (checkboxes) ----
      const laneMap = { ai: ["laneAI", "AI"], pmo: ["lanePMO", "PMO"], to: ["laneTO", "Transformation"] };
      if (body.lanes) {
        for (const k of Object.keys(laneMap)) {
          if (body.lanes[k] === undefined) continue;
          const v = !!body.lanes[k];
          if (v !== old.lanes[k]) { fields[F[laneMap[k][0]]] = v; frags.push(`${laneMap[k][1]} lane ${v ? "ON" : "OFF"}`); }
        }
      }

      // ---- vocab (long text) ----
      const vocabMap = { ai: ["vocabAI", "AI"], pmo: ["vocabPMO", "PMO"], to: ["vocabTO", "Transformation"] };
      if (body.vocab) {
        for (const k of Object.keys(vocabMap)) {
          if (body.vocab[k] === undefined) continue;
          const v = String(body.vocab[k] || "");
          if (v !== old.vocab[k]) { fields[F[vocabMap[k][0]]] = v; frags.push(`${vocabMap[k][1]} vocab updated`); }
        }
      }

      // ---- industry exclusions (long text) ----
      if (body.exclusions !== undefined) {
        const v = String(body.exclusions || "");
        if (v !== old.exclusions) { fields[F.exclusions] = v; frags.push("Industry exclusions updated"); }
      }

      // ---- re-sweep flag ----
      if (body.resweep !== undefined) {
        const v = !!body.resweep;
        if (v !== old.resweep) { fields[F.resweep] = v; if (v) frags.push("Re-sweep requested"); }
      }

      if (Object.keys(fields).length === 0) {
        return json(200, { ok: true, changed: false, settings: old, note: "No changes." });
      }

      // Append a dated Change Log line (read-then-concatenate — append-only).
      const line = `${phoenixDate()}: ${frags.join("; ")}.`;
      fields[F.changeLog] = old.changeLog ? `${old.changeLog}\n${line}` : line;

      const res = await fetch(`${AT}/${RECORD_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true }),
      });
      if (!res.ok) return json(res.status, { error: `Airtable write failed (${res.status}).`, detail: await res.text() });
      // Airtable's PATCH response keys fields by NAME (returnFieldsByFieldId is honored
      // on reads, not writes), so re-read the record by field ID for an authoritative result.
      return json(200, { ok: true, changed: true, changeLine: line, settings: mapRecord(await getRecord(token)) });
    }
    return json(405, { error: "Method not allowed — use GET or PUT." });
  } catch (err) {
    return json(400, { error: String(err.message || err) });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
