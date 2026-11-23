# Supabase migration: requirements and release gates

Status: replacement backend and migration/recovery utilities are prepared. Deployment, verified restore, and coordinated writer cutover remain separate release gates. Private execution state belongs in the private operations checkpoint.

## Operating contract

The authoritative machine-readable limits are in `config/backup-policy.json`.

- Target $0 of additional hosting and backup cost. Do not enable paid plans, overages, paid add-ons, larger runners, or new AI services. Verify the applicable account plan, existing shared usage, and hard spending controls before activation. A budget alert alone does not satisfy the spending requirement.
- Backups and freshness checks run ordinary scripts without model calls or a scheduled ChatGPT task. Existing career research continues under its separate authorized AI workflows; moving storage does not make that research free of ChatGPT usage.
- Keep the current interface, fit scores, sorting, Pursue/Close controls, screened-out exclusions, Classic route, and authentication. Keep other applications' data and permissions separate.
- Preserve current qualification settings, user edits, notes, research, contacts, stages, source keys, closed-role memory, comments, source baselines, and run history. An old snapshot is recovery evidence, not a complete current export.
- Keep all data exports, SQL dumps, credentials and backup artifacts out of the public application repository. Only generic code, schema, tests, and documentation belong here.

## Backup limits

Run one independent daily backup. Permit at most one manual extra attempt per UTC day, with a five-minute timeout per attempt. Store compressed, encrypted copies in a verified private destination. Retain up to seven copies and at least three verified recovery points. Do not remove old recovery points merely because a new backup started; only a validated, uploaded copy may count as a replacement.

The initial caps are 25 MiB per encrypted archive, 200 MiB for managed backups, a 100 MiB account-storage reserve, 2 GiB of projected monthly backup transfer, and a 350 MiB application database. Actual measured use and shared account allowances can impose lower limits. The first sizing run must include temporary overlap between the existing copies and the new upload. If three copies cannot fit, stop and request a different free destination or retention decision. Never silently enable billing or delete business records to fit a quota.

Require an explicit checked hard-stop spending setting and verified private destination before any scheduled upload. Check current shared storage before every upload and use concurrency control. Preflight estimates cannot provide an absolute account-wide billing guarantee if other repositories use the same allowance; the provider spending control remains mandatory. Existing accrued charges cannot be erased by a later budget change.

The archive contains all application tables and comments, schema, policies, role definitions without passwords, a capture manifest, counts, and checksums. Code and deployment definitions remain in source control. Document recovery locations for credentials without putting secrets in the archive manifest or logs. Include uploaded-file coverage separately if storage files are introduced; SQL dumps do not contain those files.

Validate archive integrity and decryption before treating a backup as successful. Restore into an isolated database before cutover, verifying counts, stable IDs, linked-record references, representative full notes/research, and access denials. A daily snapshot's recovery-point objective is 24 hours; raise a stale-backup failure at 36 hours. Record actual restore duration rather than inventing a recovery-time promise.

Use an independent, non-AI freshness check; a failure notification from the backup itself cannot detect a job that never started. Native provider notifications and a protected dashboard health result are acceptable. Any new message destination must be explicitly authorized before sending messages there.

## Data and process inventory

Migrate Opportunities, Settings, Companies, Contacts, Stories, Signals, Watchlist, Source Boards, Lead Inbox, and Automation Runs. Historical separate record comments remain in the unchanged Airtable archive when explicitly approved by the owner; Notes fields are included in full. New comments have a private Supabase table. Include all stages and all pages. Preserve exact source IDs and date semantics. Obtain a current schema export so linked fields, multi-selects, formulas and field IDs can be reconciled. Per-table counts and exhausted pagination must be independently verified.

Update the website's jobs, updates, settings, signals, health, operations, discovery and lead-decision endpoints; the hourly employer collector; and six research/intake/application helpers with their references. Preserve retired Watchlist polling as retired. Do not run old and new writers together.

The live schedule inventory additionally includes the hourly pipeline worker, daily morning brief, weekly signals/source tuning, and weekly university scan. Preserve their current prompts and identifiers during cutover. Update each after the replacement transport and audit path work. Unrelated schedules are outside migration scope. Keep current backend designation in a single operating handbook.

## Release gates

1. Resolve the destination organization, $0 project eligibility, current export route, and deployment credentials without publishing secrets.
2. Validate a complete current export and make a protected recovery copy.
3. Provision an isolated database with access denied by default. No private data is accessible through an anonymous or unrelated authenticated identity.
4. Import without deleting or reopening records; compare exact per-table counts, IDs, links, and representative values.
5. Pass a read-only rehearsal of the current interface, the settings-driven qualification path, and source/receipt reads.
6. Pass isolated tests of Pursue, Close, append-only notes, lead decisions, duplicate prevention, run ownership, and record comments. Do not test writes against real user decisions.
7. Verify actual backup size/runtime, shared allowance, spending controls, encrypted upload, restore, and stale-backup detection.
8. Freeze old writers, reconcile changes since export, switch backend and scheduled writers together, then read back a real completed collector and research receipt.
9. Keep Airtable unchanged as the source recovery copy. Rollback after new writes requires reconciliation; changing a code flag alone can strand new records and is not a complete rollback.

Do not mark migration complete while any release gate is unresolved. Report prepared code, live infrastructure, imported records, deployed backend, backup activation and restored-data verification as separate states.

## Verified CSV import and known limits

The CSV route preserves every raw header and cell in a private staging schema. Require full per-table raw and normalized checksums. Reconcile all original record IDs, field IDs, and relationship targets against the source UI. Verify each exported timestamp field’s timezone; CSV timestamp precision is minutes. Source creation times absent from CSV must remain unknown. Inventory attachment values and files separately. Keep all actual verification results in the private migration checkpoint.

`validate-export.cjs` remains the stricter API-export validator, including original creation time and imported-comment requirements. Do not label CSV input as passing that API validator. CSV reconciliation has its own path in `scripts/migration/csv_reconciliation.py` and independent checksums. The approved comment archive exception applies only to historical separate Airtable comments.

## Server connection and recovery preparation

Configure `WAYPOINT_SUPABASE_URL` and the secret `WAYPOINT_SUPABASE_SECRET_KEY` only in Waypoint’s server function environment. The backend flag `WAYPOINT_DATA_BACKEND` defaults to `airtable`; set it to `supabase` only at coordinated cutover. A new backend failure must not fall back to Airtable or leak the server key. The public client and existing site-wide authentication are unchanged.

Apply the SQL definitions in this order on an empty destination: `csv-staging-schema.sql`, `csv-reconciliation-schema.sql`, `application-schema.sql`, `record-write-controls.sql`, `unique-work-keys.sql`, and `backup-snapshot.sql`. Data reconciliation is a separate, private step. The snapshot RPC reads all ten physical application/provenance tables in one transaction, and captures actual schema, constraints, functions, triggers, policies, role flags without passwords, and access-control metadata. It is callable only by the server role.

`archive.cjs` compresses and encrypts the complete snapshot with AES-256-GCM and a fresh IV per copy, then verifies table counts, checksums, identities, and links on decryption. A different 256-bit recovery key must be kept outside the archive and outside this public repository. `restore.cjs` emits SQL only into `.backup-data` for an empty isolated Supabase database; it never connects to or overwrites the live database. The restore uses the canonical service-only grants and rejects unexpected row policies for explicit review. An emitted script alone does not prove a restore: execute it in isolation, compare the restored snapshot checksums, and verify anonymous/unrelated-user denials before release.

Before activation, inspect the existing Netlify plan, included credits, auto recharge, and add-ons. No plan change or credit purchase is authorized by this code. Netlify Blobs is a possible private independent destination, but provider-specific quota checks and the backup schedule must be implemented and verified separately. Do not use an invented byte allowance to pass the generic quota preflight.
