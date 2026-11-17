const { schema, list, json } = require('./lib/airtable');
exports.handler = async () => {
  try {
    const [runs, sources, leads, briefs] = await Promise.all([list(schema.runs, { 'maxRecords': '30', 'sort[0][field]': schema.runFields['Started At'], 'sort[0][direction]': 'desc' }), list(schema.sources), list(schema.leads, { filterByFormula: "{State}='New'", maxRecords: '50' }), list(schema.runs, {filterByFormula: "AND(OR({Workflow}='morning-brief',{Workflow}='manual-daily-review'),OR({Status}='Success',{Status}='Partial'))", 'sort[0][field]':schema.runFields['Finished At'], 'sort[0][direction]':'desc', maxRecords:'3'})]);
    const map = (row, fields) => Object.fromEntries(Object.entries(fields).filter(([name]) => !['Known Job IDs', 'Posting Text'].includes(name)).map(([name, id]) => [name, row.fields[id] ?? null]));
    return json(200, { asOf: new Date().toISOString(), briefs: briefs.map(r => map(r, schema.runFields)), runs: runs.map(r => ({ id: r.id, ...map(r, schema.runFields) })), sources: sources.map(r => ({ id: r.id, ...map(r, schema.sourceFields) })), leads: leads.map(r => ({ id: r.id, ...map(r, schema.leadFields) })), hunterConfigured: !!process.env.HUNTER_API_KEY, coverage: 'Direct employer pilot plus email intake; not a complete market scan.' });
  } catch (err) { return json(500, { error: err.message }); }
};
