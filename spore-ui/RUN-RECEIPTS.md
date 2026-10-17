# Run claim and completion contract, version 1

Use existing owner-private `spore_notes`, append-only, `section: "today"`, `brief_id: null`. No schema, permissions, or services change. Never fabricate historical completion. Valid machine records are excluded from normal content cards and shown in freshness details. Unrecognized bodies remain ordinary notes.

## Terminal receipt

All nine original keys remain required. Legacy receipts containing exactly these keys remain parseable, but are **unverified** and establish neither claim-safe completion nor retry authority:

```json
{"type":"spore_run_receipt","v":1,"run_id":"stable run identifier","scope":"daily_brief","scheduled_for":"2026-10-18T15:00:00Z","checked_at":"2026-10-18T16:10:00Z","outcome":"no_change","content_id":null,"message":"Checked required sources; no material changes."}
```

New claimed executions must include **all five** extensions together. No other keys are allowed:

```json
{"claim_id":"UUID","attempt":0,"owner_token":"UUIDv4","coverage":"full","content_ids":[]}
```

- Receipt scope: `daily_brief`, `two_week_sweep`, `career`, or `writing`. `two_week_sweep` covers Personal/SAFOJ/Writing. Scopes remain independent; a sweep does not cover the daily brief.
- Outcome: `published`, `no_change`, or `failed`. Coverage: `full` or `partial`. Full means all required sources for that scope were actually checked. Partial never counts as a full successful check, including no-change.
- `run_id`: string length 1–120 for legacy; UUID for extended receipts.
- `claim_id`: UUID; `attempt`: integer 0 or 1; `owner_token`: UUIDv4 with RFC variant.
- `scheduled_for`: intended run time; `checked_at`: actual outcome time. Extended records require parseable ISO date strings beginning YYYY-MM-DDT and ending Z or ±HH:MM. Legacy parsing requires the prefix and Date.parse validity but does not enforce a timezone suffix.
- `content_id`: null or UUID. Extended records require any non-null value to appear in `content_ids`.
- `content_ids`: unique UUID array, length 0–3. `published` requires at least one ID. `failed` requires an empty array and null `content_id`. All listed artifacts must exist in the owner's loaded notes/briefs for UI verification.
- `message`: string length 0–500, safe status only. No credentials/raw connector output.
- New claimed record body length must be **less than 3000 characters**. Row ID must be a UUID. All UUIDs use canonical 8-4-4-4-12 hexadecimal syntax. Legacy content_id validation remains the prior 36-character hexadecimal/hyphen check.

A declared outcome/coverage is not independently proven research. Producers must follow the source-check and publication-readback rules; the UI only validates the saved linkage and declared status.

## Immutable claim

Exactly these nine keys are required; no extras:

```json
{"type":"spore_run_claim","v":1,"scope":"daily_brief","run_id":"UUIDv8","scheduled_for":"ISO timestamp","claimed_at":"ISO timestamp","attempt":0,"owner_token":"UUIDv4","terminal_id":"UUIDv8"}
```

The same row/size/date/UUID rules apply. Scope may also be `recovery_check`, which is **claim-only**, attempt 0 only, scheduled at 08:30 America/Phoenix. No recovery_check terminal receipt is accepted or required; it never affects source-freshness warnings or counts as research.

Compute IDs by taking the first 16 bytes of SHA256 over UTF-8 JSON.stringify of the listed array. Set byte6 = (byte6 & 15) | 128 (UUIDv8), byte8 = (byte8 & 63) | 128 (RFC variant); format canonical lowercase UUID. PhoenixDate is YYYY-MM-DD in America/Phoenix derived from scheduled_for.

- Claim row ID: `['spore-run-claim-v1', ownerUUID, scope, PhoenixDate, attempt]`
- Terminal row ID: `['spore-run-receipt-v1', ownerUUID, scope, PhoenixDate, attempt]`
- Logical run_id: `['spore-run-v1', ownerUUID, scope, PhoenixDate]` (stable across attempts)

The tested implementation exports `SporeFreshness.runIds(owner, scope, date, attempt)` in `spore-ui/freshness.js`.

## Execution ownership and recovery rules

1. Generate a fresh UUIDv4 owner_token per execution. Atomically INSERT claim ON CONFLICT DO NOTHING, then exact-readback the complete claim. Only the token-matching insertion winner proceeds. A read-before-insert alone is not an atomic claim.
2. Terminal row must match claim_id, attempt, owner_token, run_id, scope, scheduled_for and the deterministic terminal_id. UI requires claimed_at <= checked_at <= current time, and claim time not in the future.
3. Persist content and read it back before a published terminal. Never declare failed after an uncertain/in-flight content write: reconcile the write instead. An unresolved claim is not permission to repeat an execution.
4. Attempt 1 is allowed only after a linked, validated attempt-0 failed terminal and no accepted artifact or uncertain in-flight write. Its claim time must be at or after the previous terminal time. The UI checks the matching failed terminal with empty content references; the producer must additionally rule out uncertain external writes.
5. No leases or elapsed-time takeover. Claim without matching terminal stays unresolved. After grace, show stalled/unverified, do not autorun again. No retries for recovery_check.
6. Before an 08:30 recovery invocation, honor the primary 08:00–09:00 flexible run window. Do not duplicate an active sweep; defer to inspect after the window. UI grace ends at 09:30 Arizona.

## User-visible freshness

- Content publication date, browser sync time, and declared source-check completion are separate.
- A validated linked terminal with full coverage and published/no_change is successful. Successful no-change does not require changing yesterday's useful content.
- Partial coverage warns. Failed terminal warns. An active linked claim shows in progress, then stalled/unverified after grace.
- A current saved brief without linked completion remains explicitly unverified; after grace it warns. Legacy/unlinked receipts never establish success.
- `two_week_sweep` has its own status once records exist. `recovery_check` is excluded from source status.
- Browser database reads never create receipts or establish research success.

The dashboard is a reader of this contract, not the execution scheduler. It does not insert claims, choose execution owners, write receipts, or retry jobs.
