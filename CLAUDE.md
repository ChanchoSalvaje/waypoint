# CLAUDE.md — Pipeline Command Center

Project memory for Claude Code. Read this fully before acting. Full scope lives in `PLAN.md`.

## What this is
A master–detail web app over an existing Airtable base: a dashboard (Today's next actions + pipeline snapshot) that drills into any job's full detail (company info, contacts, salary, interview prep, notes, status). The builder is a novice — explain what you're doing in plain language and go one small step at a time.

## Stack & approach
- Plain **HTML / CSS / vanilla JS** front end. No React/Vue/heavy frameworks — keep it simple and maintainable.
- **Netlify Functions** (serverless) as the Airtable proxy and secret-holder.
- **Slice 1 is local-first** — run via `netlify dev`. No deploy yet.
- Reuse the existing design from the TEP prep page (`index.html`): the "voltage/steel" palette, the mono instrument-label style, the card layout. Do NOT replace it with a generic template.

## Golden rules (do not violate)
1. **Secret handling:** the Airtable Personal Access Token lives ONLY in a local `.env` file that is **gitignored**. Never hardcode it, never put it in client-side JS, never commit it, never print it to logs. It is used ONLY inside serverless functions.
2. **Read-first:** build and verify the read/display path before writing anything back to Airtable.
3. **Real data only:** the shipped UI shows real Airtable records — do not leave fabricated placeholder jobs in the final interface.
4. **Notes are append-only:** when writing updates to the Notes field, append a dated entry; never overwrite existing content.
5. **Ask before destructive actions** (deleting files, force operations). Make small, reviewable changes.

## Airtable reference
- Base `appUQQ4gnT7UuFOOm`, Opportunities table `tblWZyC4j4z12roVq`.
- Confirm live field IDs by querying the Airtable API before wiring fields — don't assume.
- Select-field writes require typecast. Read with explicit field IDs.

## Workflow
- Slice 1 goal: dashboard + job list + drill-down detail, all READ-ONLY, running locally on live Airtable data.
- Confirm each slice works before starting the next. When unsure about scope or a design choice, ask rather than guess.
