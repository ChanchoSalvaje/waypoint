# Supabase migration: requirements and release gates

Status: preparation only. No database import, backend switch, billing change, or backup schedule has been activated by these files.

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

Migrate Opportunities, Settings, Contacts, Signals, Watchlist, Source Boards, Lead Inbox, Automation Runs, and record comments. Include all stages and all pages. Preserve exact source IDs and date semantics. Obtain a current schema export so linked fields, multi-selects, formulas and field IDs can be reconciled. Per-table counts and exhausted pagination must be independently verified.

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
