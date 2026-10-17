# Daily freshness receipts, version 1

No schema or permission change is required. Append one owner-private `spore_notes` record in `section: "today"`, `brief_id: null`. Its body must be exactly a JSON object with these keys (all required; no extra keys):

```json
{"type":"spore_run_receipt","v":1,"run_id":"stable unique run identifier","scope":"daily_brief","scheduled_for":"2026-10-18T15:00:00Z","checked_at":"2026-10-18T16:10:00Z","outcome":"no_change","content_id":null,"message":"Checked the required sources; no material changes."}
```

This example is documentation, not an actual completion record. Never backfill a fabricated success.

- `scope`: `daily_brief`, `career`, `writing`, or `two_week_sweep` (Personal/SAFOJ/Writing coverage). Only `daily_brief` covers the daily brief; `two_week_sweep` is independently displayed in freshness details.
- `outcome`: `published`, `no_change`, or `failed`. A no-change success requires actually completing the relevant source check.
- `content_id`: saved brief/note UUID or null. `published` should reference a successful saved-content readback; never claim publication before readback.
- `scheduled_for`: original intended run time; `checked_at`: actual outcome time. Use ISO timestamps with timezone.
- `message`: safe user-readable text, at most 500 characters; no credentials/raw errors/private connector payloads.
- Use a stable receipt row UUID per run/attempt and read before retrying an ambiguous insert. Existing notes are append-only. Do not overwrite user notes.
- Before a recovery run, inspect the primary run status and existing receipts. At 08:30 Arizona, an 08:00 flexible sweep may legitimately still be within its 08:00–09:00 window: defer while active, avoid simultaneous runs, and inspect again after the window. The UI's warning deadline is 09:30 Arizona.
- A last successful *browser sync* is independent of a source check. The UI never synthesizes run receipts from database reads.
- Valid receipts are excluded from ordinary notes and shown under Freshness details. Invalid or unknown-version records remain visible as ordinary notes rather than silently disappearing.

UI status: today's saved brief without a receipt says source-check receipt not recorded. Older/missing briefs await today's publication/check before the deadline, and warn after it. A successful same-day daily no-change receipt is healthy even if content is older. A later failed same-day daily receipt warns. A five-minute foreground refresh and online/visibility refresh retrieve saved records; open editors/readers defer automatic refresh. Ordinary network errors retain data and drafts; authentication/owner failures lock and clear private UI.

## Exact version-1 reader validation

- Row `section` must equal `today`. The reader does not validate row `brief_id`; publishers should use null.
- Body must parse as a non-array JSON object with exactly all nine documented keys; additional or missing keys are rejected.
- `type` equals `spore_run_receipt`; `v` is the number 1.
- `run_id` is a string of length 1–120 (no additional character restriction).
- `scope` and `outcome` must match the enumerations above. Version 1 accepts terminal outcomes only, not `started`.
- `scheduled_for` and `checked_at` are strings beginning YYYY-MM-DDT and parseable by JavaScript Date.parse. Publishers must use explicit timezone offsets or Z; the current reader does not independently enforce a timezone suffix.
- `content_id` is null or a 36-character string consisting only of hexadecimal characters and hyphens, case-insensitive. This is a syntax check, not a database existence/readback check.
- `message` is a string of length 0–500.
- `created_at` is carried as recorded_at, but does not prove source coverage or execution ownership.

Version 1 is a display contract, **not an execution claim or concurrency lock**. Do not use a read-then-insert v1 receipt as an atomic claim. A separately typed, strictly validated claim/terminal protocol with deterministic per-date identity, ownership, and source coverage is pending the recovery worker's contract. Do not add unrecognized fields to v1 or fabricate past checks.
