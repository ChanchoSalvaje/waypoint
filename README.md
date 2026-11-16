# Waypoint

A personal dashboard for running a job search. It sits on top of an Airtable base and opens on what needs doing today, then the pipeline, then the full detail behind each opportunity: notes, prep, pay range and status. I can update a job from the page, and every change is written back to Airtable.

## How it's built

- Plain HTML, CSS and JavaScript on the front end, with no framework, so it stays easy to maintain.
- Netlify Functions read and write Airtable. The API token stays in Netlify's environment variables and never reaches the browser.
- A Netlify edge function puts the whole site behind a password.
- Writes are limited on purpose. One record at a time, five allowed fields, and notes that can only be added to, never overwritten.
- An hourly scheduled launcher starts a background collector for configured public employer boards (Greenhouse, Lever, Ashby). The first complete read is a baseline; later unseen matching postings enter a separate raw Lead Inbox for qualification. The historical Watchlist job poller remains retired.
- Decision briefs, contact research and reply proposals appear beside the preserved full dossiers. System coverage distinguishes a successful pipeline read from actual employer-board freshness and completed workflow receipts.
- The original interface remains at `/classic.html`; the existing Spore workspace remains at `/spore/`.
- Tests cover display/content preservation, existing authentication and write boundaries, source pagination, collector replay/recovery, and honest freshness states.

## Operations

The collector is scheduled at minute 10 of each UTC hour (also minute 10 in Tucson). Netlify's short scheduled invocation launches the background function using the existing server-only site authentication. Neither credentials nor Airtable data belong in this repository. Inspect the deployed function's schedule/logs and the canonical Automation Runs receipts to verify execution; the configuration file alone does not prove a deployment or run.

Collector receipts use an hourly key and read-before-write ownership checks. These checks are not an atomic lock. Unresolved Running work blocks another collector; reconcile its writes before retrying. Candidate writes are read back before the board baseline advances. Uncertain creates are not automatically retried. Source failures preserve the previous baseline and appear as Partial/Failed receipts. Reads older than two hours show as overdue in the System view.

Hunter is optional and disabled unless both server configuration and explicit lookup enablement are present. A user-initiated lookup can consume account credits; no outreach or applications are sent. The ordinary website link works without API setup.

Run `npm test` before deployment. Production publishes from GitHub `main`; a pull-request deploy preview is suitable for interface review but does not automatically run scheduled functions. Verify the published commit, inspect the collector's Scheduled badge, perform a provider-controlled Run now check, and confirm its business-data readback. An automatic scheduled run must be observed separately from that manual test.

Rollback the code to the preceding published Git commit through the normal deployment flow. A code rollback does not reverse tracker changes, source baselines, or run receipts; preserve and reconcile those separately.

## How I built it

I'm not a software engineer. I worked out what Waypoint should do and how it should behave with Claude, then directed Claude Code to build it in small slices: read-only first, then writes, then deployment behind a password.

The rest of the system runs outside this repo. Scheduled AI tasks read job-alert email, score each role against my criteria, and draft research on the ones I flag. I make every decision and submit every application myself.
