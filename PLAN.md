# Pipeline Command Center — Build Plan

> Single source of truth for the app. Both the Council (chat) and Claude Code read from this.
> Keep it current: when a decision changes, change it here first.

---

## 1. What we're building
One web app over Tim's existing Airtable job-search base — a **master–detail** tool:
- **Dashboard** — overall stats + a *Today / Next Actions* list (the hero) + a pipeline snapshot.
- **Drill-down (detail)** — open any job and see everything: company info, contacts, salary, company intel, interview prep (the TEP-style dossier), notes, and status. Change status and log updates from inside the job.

The app is a **face** over Airtable. Airtable stays the single source of truth (it's the engine); this app is the polished, usable front end — NOT Airtable's own interface builder.

## 2. Design decisions (locked)
- **Morning view = "What do I do today."** The dashboard opens with next actions across all active jobs, sorted by urgency (Next Action Date). Pipeline funnel sits below it.
- **Optimization target = more interviews via faster tailored materials.** The app should highlight jobs ready to advance and (later slice) generate tailored, honest, ATS-friendly resumes/covers per posting.
- **Default to active jobs; toggle to reveal Closed** (full lifecycle/history on demand, not cluttering the daily view).
- **Preserve the existing visual design** from the TEP prep page (the "voltage/steel" system) — do not restyle into a generic template.

## 3. Architecture
- **Data layer:** Airtable (existing base). The shared, always-current truth.
- **Front end:** plain HTML / CSS / vanilla JS (the design we already built). No heavy framework — keep it novice-maintainable.
- **Write path + secret handling:** a **serverless function** (Netlify Function) that holds the Airtable key server-side and proxies read/write. The key never touches the browser.
- **Slice 1 runs LOCALLY** on Tim's Mac (via `netlify dev`) — no public URL yet.

## 4. Build phases (thin slices — do in order)
- **Slice 1 — READ (now):** Dashboard (Today's next actions + pipeline snapshot) + list of active jobs + drill-down detail that *displays* live Airtable data. Local only. Nothing writes yet.
- **Slice 2 — WRITE:** Change Stage, edit Next Action, append dated updates to Notes — written back to Airtable through the serverless function.
- **Slice 3 — DEPLOY:** Netlify, with the key secured server-side **and a simple password gate** (the page shows real confidential search data, so it must not be open on the public web).
- **Slice 4+ — SMART LAYERS:**
  - Staleness flag (jobs with no touch in N days float to the top).
  - Pipeline-health read (response rate, where things stall) — meaningful once ~15+ applications exist.
  - **Artifact generator** — tailored, honest, ATS-friendly resume/cover per job. Directly serves the 90-day win (more interviews).
- **Backlog (full vision, later):** comp calculators (W2 salary tracker + 1099 / corp-to-corp hourly), compliant warm-path/outreach finder, profile & goals intake, in-product Council.

## 5. Data model (Airtable reference)
- **Base:** `appUQQ4gnT7UuFOOm`  ·  **Table (Opportunities):** `tblWZyC4j4z12roVq`
- Key fields (confirm live field IDs via the Airtable API before building — treat these as a guide, not gospel):
  - Company, Role, Stage, Track, Fit Score, Fit Read, Excitement
  - Next Action, Next Action Date, Comp Range, Work Mode, Link, Source
  - Notes (dated audit log — append, never overwrite)
  - Prep dossier: Company Background & History, Edge Facts, Questions to Ask, Likely Questions & Prep
- Only TEP has a full prep dossier so far; other jobs show a clean "no prep authored yet" state (a visible to-do).

## 6. Data & secrets (non-negotiable)
- The Airtable **Personal Access Token** lives ONLY in a local `.env` file, which is **gitignored** and never committed, shared, or printed.
- The token is used ONLY inside the serverless function — never in client-side JavaScript.
- Slice 1 is local-first. Public deployment (Slice 3) requires the token as a host-side environment variable **and** a password gate.

## 7. Guardrails
- **Honesty:** any generated resume/cover reframes and quantifies real accomplishments — never fabricates. Every claim defensible under recruiter scrutiny.
- **Human in the loop:** Tim approves anything consequential (applications, outreach). The app automates prep, tracking, drafting — never submission.
- **Read-first:** prove display on trusted live data before enabling any write.
