const { schema, list, write, json } = require('./lib/airtable');
const { fetchBoard, planCandidates } = require('./lib/boards');
const S = schema.sourceFields, L = schema.leadFields, R = schema.runFields;
function createHandler(deps = {}) {
 const readList = deps.list || list, save = deps.write || write, readBoard = deps.fetchBoard || fetchBoard;
 const clock = deps.clock || (() => new Date());
 async function verify(table, rows) {
   if (!rows.length) return;
   const actual = await readList(table, { filterByFormula: 'OR(' + rows.map(r => `RECORD_ID()='${r.id}'`).join(',') + ')' });
   for (const expected of rows) {
     const row = actual.find(r => r.id === expected.id);
     if (!row || Object.entries(expected.fields).some(([key,value]) => JSON.stringify(row.fields[key] ?? '') !== JSON.stringify(value))) throw new Error('Readback mismatch; reconcile before retrying.');
   }
 }
 return async event => {
  // This background URL also remains behind the unchanged site-wide password gate.
  let invocation; try { invocation = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid invocation.' }); }
  if (!invocation.next_run || !Number.isFinite(Date.parse(invocation.next_run))) return json(405, { error: 'Scheduled invocation only.' });
  const now = clock().toISOString(), runKey = `employer-collector:${now.slice(0,13)}:00Z`;
  let receipt;
  try {
    const priorRuns = await readList(schema.runs, { filterByFormula: "{Workflow}='employer-collector'" });
    if (priorRuns.some(r => r.fields[R['Run Key']] === runKey || r.fields[R.Status] === 'Running')) return json(202, { skipped: true, reason: 'Existing slot or unresolved collector run.', runKey });
    receipt = (await save(schema.runs, [{ fields: { [R['Run Key']]: runKey, [R.Workflow]: 'employer-collector', [R['Started At']]: now, [R.Status]: 'Running' } }]))[0];
    const owners = await readList(schema.runs, { filterByFormula: `{Run Key}='${runKey}'` });
    if (owners.length !== 1 || owners[0].id !== receipt.id) throw new Error('Overlapping collector receipts; reconcile ownership before retrying.');
    const boards = (await readList(schema.sources)).filter(r => r.fields[S.Enabled]);
    const inbox = await readList(schema.leads), keys = new Set(inbox.map(r => r.fields[L['Source Key']]));
    let read = 0, written = 0, failures = [], baselines = 0, completed = 0;
    // Bound runtime without silently claiming coverage beyond this pilot.
    if (boards.length > 20) throw new Error('Pilot has more than 20 enabled boards; increase collector capacity before expanding.');
    const deadline = Date.now() + 12 * 60 * 1000;
    for (const row of boards) {
      if (Date.now() > deadline) { failures.push("Runtime budget reached; remaining boards not checked."); break; }
      const f = row.fields;
      await save(schema.sources, [{ id: row.id, fields: { [S['Last Attempt']]: now } }], 'PATCH');
      try {
        const jobs = await readBoard(f[S.Provider], f[S.Board]); read += jobs.length;
        const prior = f[S['Known Job IDs']] ? JSON.parse(f[S['Known Job IDs']]) : null;
        if (prior != null && (!Array.isArray(prior) || prior.some(x => typeof x !== 'string'))) throw new Error('Invalid stored baseline.');
        const candidates = planCandidates(jobs, prior == null ? null : new Set(prior), keys);
        if (prior == null) baselines++;
        if (candidates.length > 50) throw new Error('More than 50 new matching postings; preserve baseline for review instead of flooding the queue.');
        const entries = candidates.map(j => ({ fields: { [L['Source Key']]: j.key, [L.Company]: f[S.Company], [L.Role]: j.title, [L.Location]: j.location, [L['Posting URL']]: j.url, [L['Apply URL']]: j.apply, [L['Posting Text']]: j.text.slice(0, 95000), [L['First Seen At']]: now, ...(j.timestamp ? { [L['Employer Timestamp']]: j.timestamp } : {}), [L['Timestamp Kind']]: j.timestampKind, [L.State]: 'New', [L['Review Notes']]: 'Unseen since last successful board scan. Newly observed does not prove newly created. Awaiting qualification.' } }));
        if (entries.length) {
          const saved = await save(schema.leads, entries);
          if(saved.length !== entries.length || saved.some(r=>!r.id)) throw new Error('Incomplete candidate write response; reconcile before retrying.');
          await verify(schema.leads, saved.map((r,i)=>({id:r.id,fields:entries[i].fields})));
        }
        candidates.forEach(j => keys.add(j.key)); written += entries.length;
        const snapshot = JSON.stringify(jobs.map(j => j.id));
        if (snapshot.length > 95000) throw new Error('Board baseline exceeds storage limit; split coverage before enabling.');
        const sourceUpdate = { id: row.id, fields: { [S['Last Success']]: clock().toISOString(), [S['Last Error']]: '', [S['Jobs Seen']]: jobs.length, [S['Known Job IDs']]: snapshot } };
        await save(schema.sources, [sourceUpdate], 'PATCH');
        await verify(schema.sources, [sourceUpdate]); completed++;
      } catch (err) { const message = `${f[S.Company]}: ${err.message}`; failures.push(message); await save(schema.sources, [{ id: row.id, fields: { [S['Last Error']]: err.message } }], 'PATCH'); }
    }
    const finished = { id: receipt.id, fields: { [R['Finished At']]: clock().toISOString(), [R.Status]: failures.length ? 'Partial' : 'Success', [R['Items Read']]: read, [R['Items Written']]: written, [R.Details]: JSON.stringify({ boards: boards.length, completed, baselines, failures, coordination: 'Read-before-write; not an atomic lock.', coverage: 'Configured public ATS boards only; excludes the rest of the market.' }) } };
    await save(schema.runs, [finished], 'PATCH'); await verify(schema.runs, [finished]);
    return json(200, { boards: boards.length, read, written, failures });
  } catch (err) {
    if (receipt) await save(schema.runs, [{ id: receipt.id, fields: { [R['Finished At']]: clock().toISOString(), [R.Status]: 'Failed', [R.Details]: err.message } }], 'PATCH').catch(() => {});
    return json(500, { error: err.message });
  }
 };
}
exports.createHandler = createHandler;
exports.handler = createHandler();
