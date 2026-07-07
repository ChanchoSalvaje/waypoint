// netlify/functions/jobs.js
// ---------------------------------------------------------------------------
// Slice 1 — READ ONLY. This serverless function is the Airtable proxy.
// It holds the Airtable token server-side (from the AIRTABLE_TOKEN env var),
// fetches every record from the Opportunities table, maps each one into the
// shape index.html already knows how to render, and returns them as JSON.
//
// The token is NEVER sent to the browser. The browser only ever sees the
// mapped job data below. No create/update/delete happens here.
// ---------------------------------------------------------------------------

const BASE_ID = "appUQQ4gnT7UuFOOm";
const TABLE_ID = "tblWZyC4j4z12roVq";

// Exact live field IDs (confirmed against the Airtable schema, not assumed).
// We read by field ID so a rename in Airtable can't silently break the app.
const FIELDS = {
  company:        "flduaK4UtRwoU9WLu", // Company
  role:           "fldAGmW3YgUsHNbWe", // Role
  stage:          "fldE1YGHZdjiPIkiR", // Stage (singleSelect)
  fit:            "fldybh7PiN0armOSP", // Fit Score (number, read-only)
  excitement:     "fldOzdAtFpCpi2GVU", // Excitement (number, editable 1–5)
  comp:           "fld4neoTZvK52G9l4", // Comp Range
  workMode:       "fldYTT2ylx7e87wo9", // Work Mode (singleSelect)
  nextAction:     "fldQjbPglCq07XJJD", // Next Action
  nextActionDate: "fldN1P81pvY2xNl4C", // Next Action Date (date)
  link:           "fldpNcqFRnN7zMzzO", // Link
  source:         "fldVtN8Rdj3b1yDML", // Source (singleSelect)
  prepBackground: "fldkmdiZ6NgeFVEp2", // Company Background & History
  prepEdge:       "fldwwUC9CLZ9WHIYA", // Edge Facts
  prepQuestions:  "fldTCQjStup2JH3VP", // Questions to Ask
  prepLikely:     "fldBAnSfhJ1f68Nky", // Likely Questions & Prep
  notes:          "fldXN9uz1ZcIFtsKm", // Notes
};

// Turn one Airtable record into the job shape index.html renders.
function mapRecord(record) {
  const f = record.fields || {};
  return {
    id:             record.id,
    company:        f[FIELDS.company] || "",
    role:           f[FIELDS.role] || "",
    stage:          f[FIELDS.stage] || "",
    fit:            f[FIELDS.fit] ?? null,
    excitement:     f[FIELDS.excitement] ?? null,
    comp:           f[FIELDS.comp] || "",
    workMode:       f[FIELDS.workMode] || "",
    nextAction:     f[FIELDS.nextAction] || "",
    nextActionDate: f[FIELDS.nextActionDate] || "",
    link:           f[FIELDS.link] || "",
    source:         f[FIELDS.source] || "",
    prep: {
      background: f[FIELDS.prepBackground] || "",
      edge:       f[FIELDS.prepEdge] || "",
      questions:  f[FIELDS.prepQuestions] || "",
      likely:     f[FIELDS.prepLikely] || "",
    },
    notes: f[FIELDS.notes] || "",
  };
}

exports.handler = async function () {
  const token = process.env.AIRTABLE_TOKEN;

  // Fail loudly (but safely) if the token hasn't been set in .env yet.
  if (!token) {
    return json(500, {
      error:
        "AIRTABLE_TOKEN is not set. Paste your token into the .env file, then restart `netlify dev`.",
    });
  }

  try {
    const records = [];
    let offset;

    // Airtable returns up to 100 records per page; loop until no more pages.
    do {
      const url = new URL(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`
      );
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("returnFieldsByFieldId", "true"); // key fields by ID
      if (offset) url.searchParams.set("offset", offset);

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const detail = await resp.text();
        return json(resp.status, {
          error: `Airtable request failed (${resp.status}).`,
          detail,
        });
      }

      const page = await resp.json();
      records.push(...(page.records || []));
      offset = page.offset;
    } while (offset);

    return json(200, { jobs: records.map(mapRecord) });
  } catch (err) {
    return json(500, { error: "Unexpected error fetching Airtable data.", detail: String(err) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
