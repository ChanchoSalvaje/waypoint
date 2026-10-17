# Daily freshness receipts, version 1

No schema or permission change is required. Append one owner-private `spore_notes` record in `section: "today"`, `brief_id: null`. Its body must be exactly a JSON object with these keys (all required; no extra keys):

```json
{"type":"spore_run_receipt","v":1,"run_id":"stable unique run identifier","scope":"daily_brief","scheduled_for":"2026-10-18T15:00:00Z","checked_at":"2026-10-18T16:10:00Z","outcome":"no_change","content_id":null,"message":"Checked the required sources; no material changes."}
```

This example is documentation, not an actual completion record. Never backfill a fabricated success.

- `scope`: `daily_brief`, `career`, or `writing`; career/writing alone cannot cover the daily brief.
- `outcome`: `published`, `no_change`, or `failed`. A no-change success requires actually completing the relevant source check.
- `content_id`: saved brief/note UUID or null. `published` should reference a successful saved-content readback; never claim publication before readback.
- `scheduled_for`: original intended run time; `checked_at`: actual outcome time. Use ISO timestamps with timezone.
- `message`: safe user-readable text, at most 500 characters; no credentials/raw errors/private connector payloads.
- Use a stable receipt row UUID per run/attempt and read before retrying an ambiguous insert. Existing notes are append-only. Do not overwrite user notes.
- Before a recovery run, inspect the primary run status and existing receipts. At 08:30 Arizona, an 08:00 flexible sweep may legitimately still be within its 08:00–09:00 window: defer while active, avoid simultaneous runs, and inspect again after the window. The UI's warning deadline is 09:30 Arizona.
- A last successful *browser sync* is independent of a source check. The UI never synthesizes run receipts from database reads.
- Valid receipts are excluded from ordinary notes and shown under Freshness details. Invalid or unknown-version records remain visible as ordinary notes rather than silently disappearing.

UI status: today's saved brief without a receipt says source-check receipt not recorded. Older/missing briefs await today's publication/check before the deadline, and warn after it. A successful same-day daily no-change receipt is healthy even if content is older. A later failed same-day daily receipt warns. A five-minute foreground refresh and online/visibility refresh retrieve saved records; open editors/readers defer automatic refresh. Ordinary network errors retain data and drafts; authentication/owner failures lock and clear private UI.
