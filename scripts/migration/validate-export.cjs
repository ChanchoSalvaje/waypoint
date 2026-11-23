const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { requiredTables } = require('../../config/backup-policy.json');
const recordId = /^rec[A-Za-z0-9]{14}$/;
const fieldId = /^fld[A-Za-z0-9]{14}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function validateExport(input, now = new Date()) {
  const failures = [], counts = {}, checksums = {};
  const source = input?.source || {};
  const tables = input?.tables;
  if (input?.version !== 1 || !object(tables)) return {ok:false, failures:['Unsupported export envelope.'], counts, checksums};
  if (source.provider !== 'airtable' || source.complete !== true || source.paginationComplete !== true || source.allStagesIncluded !== true || source.commentsComplete !== true) failures.push('Source completeness, all-stage coverage, comments, and pagination must be verified.');
  const captured = Date.parse(source.capturedAt);
  if (!Number.isFinite(captured) || captured > now.getTime() || now.getTime() - captured > 86400000) failures.push('A verified export captured within the last 24 hours is required.');
  for (const name of requiredTables) if (!Object.hasOwn(tables, name)) failures.push(`Missing required table: ${name}`);
  const ids = new Map();
  for (const [name, table] of Object.entries(tables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !Array.isArray(table?.records) || !Array.isArray(table?.fields)) { failures.push('Invalid table envelope.'); continue; }
    const rows = table.records, fields = table.fields;
    const schemaIds = new Set(fields.map(field => field.id));
    if (schemaIds.size !== fields.length || fields.some(field => !fieldId.test(field.id) || typeof field.name !== 'string' || !field.name || typeof field.type !== 'string' || !field.type)) failures.push(`Incomplete or duplicate field definitions: ${name}`);
    const seen = new Set();
    for (const row of rows) {
      if (!recordId.test(row?.id) || seen.has(row.id) || !object(row.fields) || !Number.isFinite(Date.parse(row.createdTime))) { failures.push(`Invalid or duplicate record: ${name}`); continue; }
      seen.add(row.id);
      if (Object.keys(row.fields).some(key => !schemaIds.has(key))) failures.push(`Record field missing from schema: ${name}`);
    }
    ids.set(name, seen);
    counts[name] = rows.length;
    if (!Number.isInteger(source.verifiedCounts?.[name]) || source.verifiedCounts[name] !== rows.length) failures.push(`Independent source count missing or mismatched: ${name}`);
    checksums[name] = digest({fields, records:[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))});
  }
  for (const [name, table] of Object.entries(tables)) {
    if (!Array.isArray(table?.fields) || !Array.isArray(table?.records)) continue;
    for (const field of table.fields.filter(field => ['multipleRecordLinks','multipleRecordLink'].includes(field.type))) {
      const target = ids.get(field.linkedTableKey);
      if (!target) { failures.push(`Linked table mapping missing: ${name}`); continue; }
      for (const row of table.records) {
        const links = row?.fields?.[field.id];
        if (links !== undefined && (!Array.isArray(links) || links.some(id=>!target.has(id)))) failures.push(`Broken linked record reference: ${name}`);
      }
    }
  }
  const comments = input.comments;
  if (!Array.isArray(comments) || !Number.isInteger(source.verifiedCommentCount) || source.verifiedCommentCount !== comments.length) failures.push('Independent record-comment count missing or mismatched.');
  else {
    const seen = new Set();
    for (const comment of comments) {
      const key = [comment.table,comment.recordId,comment.id].join(':');
      if (typeof comment.id !== 'string' || !comment.id || seen.has(key) || !ids.get(comment.table)?.has(comment.recordId) || typeof comment.text !== 'string' || !Number.isFinite(Date.parse(comment.createdTime))) failures.push('Invalid, duplicate, or orphaned record comment.');
      seen.add(key);
    }
    checksums.comments = digest(comments);
  }
  if (!recordId.test(source.activeSettingsRecordId) || !ids.get('settings')?.has(source.activeSettingsRecordId)) failures.push('The current active Settings record must be identified and included.');
  return {ok:failures.length===0, failures:[...new Set(failures)], counts, checksums};
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('missing file');
    const result = validateExport(JSON.parse(fs.readFileSync(file,'utf8')));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if (!result.ok) process.exitCode = 1;
  } catch { process.stderr.write('Supply a readable current export JSON file; record contents are never logged.\n'); process.exitCode=1; }
}
module.exports = { validateExport };
