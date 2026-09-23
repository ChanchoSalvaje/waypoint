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
1. **Secret handling:** the Airtable Personal Access Token has ONE home: the Netlify site's environment variables, with the Local development context included so `netlify dev` injects it. Don't keep a second copy in `.env` (it drifts on rotation); `.env` stays gitignored in any case. Never hardcode the token, never put it in client-side JS, never commit it, never print it to logs. It is used ONLY inside serverless functions.
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

## Docs that live outside this repo (one copy each, 2026-09-22)
- **Scoring rubric** (`SCORING.md`) and the parked **North Star** layout (`NORTH-STAR.md`) live in the claude.ai Waypoint project, not here. The repo copies were older duplicates (SCORING was v1; the project has v1.1) and were removed.
- **Live thresholds** (comp gate, target, level, lanes, location, exclusions) come from the Airtable **Settings** table at run time. Don't copy numbers from any doc into code.
- The **enrich-pursued-jobs** skill runs from the installed skill (v4.1 at time of writing). The July copy that sat here was removed so nobody edits a file that never runs.
- `DESIGN.md` stays here and is the design source of truth.
