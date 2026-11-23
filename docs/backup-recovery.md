# Private daily recovery copies

The new schedule is disabled until `WAYPOINT_BACKUPS_ENABLED=true` is explicitly configured. The existing backend flag is separate. Deploying this code does not switch live data storage.

## Service configuration

Use modern Netlify Functions with the automatically configured, private, site-wide `waypoint-backups` Blobs store. Do not use a deploy-scoped store: recovery copies must survive application deployments. No endpoint serves archive contents or accepts caller-supplied object keys. The existing site-wide authentication gate also covers backup status.

The ordinary Node backup runs at 10:40 UTC (03:40 Arizona time). It makes no model calls. It reads the service-only transaction-consistent snapshot RPC, compresses it, encrypts it with AES-256-GCM, uploads the encrypted bytes, reads them back, checks their checksum, decrypts them, and verifies their manifest. Only then may it advance the latest-success marker or prune old verified recovery copies.

Set these values in the production Functions scope only:

- `WAYPOINT_SUPABASE_URL` and secret `WAYPOINT_SUPABASE_SECRET_KEY`: existing private connection.
- Secret `WAYPOINT_BACKUP_ENCRYPTION_KEY`: exactly 64 lowercase hexadecimal characters. Keep a separate private recovery copy outside Netlify Blobs. Never commit it or log it.
- `WAYPOINT_BACKUP_SPEND_BLOCK=netlify-auto-recharge-disabled`: operator attestation that the existing team's auto recharge is disabled and no paid add-ons or credit purchases are being activated.
- `WAYPOINT_BACKUPS_ENABLED=true`: explicit activation after independent recovery and provider checks.

Use the scheduled function's Netlify **Run now** control for the initial provider rehearsal. Check its result and the private Blobs inventory, then check the authenticated `/.netlify/functions/backup-status` endpoint. A local mock test does not verify the provider's runtime or permissions.

## Limits and cost controls

Require the existing provider hard spending block before activation. This code never enables a paid plan, purchases credits, or changes billing. Usage draws from the existing team's included credits. Credit exhaustion can pause the team's projects; it must not trigger automatic purchases.

The generic `scripts/backup/preflight.cjs` is for destinations with measured shared byte allowances. Netlify Blobs has no separate account byte quota in the credit-based plan documentation, so this adapter does not invent such an allowance or claim to poll the team's billing configuration. It measures the managed archive inventory before every upload, includes temporary upload overlap, checks the source database size, and maintains a conservative monthly transfer ledger. Reverify the provider hard block if account billing settings change. Other projects' consumption can exhaust the shared credit pool.

The policy caps remain: 25 MiB per archive, 200 MiB of managed archive storage including overlap, 350 MiB source database, 2 GiB of monthly backup transfer, and two attempts per UTC day. A conditional lease prevents overlapping jobs. Network requests share a 25-second deadline, below the scheduled function's execution limit. An uncertain or failed upload does not replace a prior verified recovery point.

Retain up to seven verified copies; the first three recovery points accumulate as daily backups run. No old verified copies are pruned while fewer than three exist. A failed, unverified object still counts against measured storage; investigate orphaned objects rather than deleting older recovery points to force an upload.

## Freshness and recovery

The System view independently reads backup status. A missing, future-dated, or more-than-36-hour-old success marker is stale; a recent failed attempt produces a warning while preserving the previous verified copy. This check uses ordinary code. It does not create an AI automation or send an unapproved message.

Retrieve an encrypted `.wpbk` file from the authenticated Netlify Blobs UI. Locate the separate private recovery-key file and set its key in `WAYPOINT_BACKUP_ENCRYPTION_KEY` for local restore preparation. Use `scripts/backup/restore.cjs INPUT_ARCHIVE /absolute/path/.backup-data/restore.sql`. This decrypts and validates the archive and emits a SQL script; it does not connect to a database.

Restore only into an empty isolated Supabase database, with its standard `anon`, `authenticated`, and `service_role` roles available. Review the emitted SQL before executing. Verify every table's full checksum and count, stable record IDs, linked references, full history, private access denials, and a rolled-back write/audit test. Retain JSON null values in the reconciliation staging table; generic record conversion would turn them into SQL NULL. An unexpected row policy requires review rather than silent reinterpretation.

The archive covers application data, new comments, source provenance, schema, constraints, indexes, functions, triggers, row-security settings, policies, and role metadata without passwords. Historical separate Airtable comments remain in the unchanged source archive when the owner approves that exception. New attachment/file features require a separate file-coverage inventory; a database snapshot alone does not back up file objects.

Provider references:

- https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- https://docs.netlify.com/build/functions/scheduled-functions/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/configure-auto-recharge/
